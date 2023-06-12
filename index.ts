require('dotenv').config();
const Parser = require('rss-parser');
const parser = new Parser();
const moment = require('moment');
const fetch = require('node-fetch');
import { Configuration, OpenAIApi } from 'openai';
import { Item } from 'rss-parser';

type ArticleWithSummary = {
  title: string;
  link: string;
  summary: string;
};

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

const RSS_LIST = [
  'https://callcenter-japan.com/index.rdf',
  'https://aisaas.pkshatech.com/cx-journal/rss.xml',
  'https://www.zendesk.co.jp/public/assets/sitemaps/ja/feed.xml',
  'https://karakuri.ai/column/feed/',
  'https://fonolo.com/feed/',
];

const postToSlack = async (data: any) => {
  try {
    if (!WEBHOOK_URL) return;
    console.log(JSON.stringify(data));
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }

    const responseText = await response.text();
    console.log(responseText);
  } catch (error) {
    console.error(error);
  }
};

const summarizeArticle = async (text: string): Promise<string> => {
  if (!text) return '';

  const response = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'user',
        content: `
      下記の記事を2文以内にわかりやすくまとめてください。また、言語は日本語でお願いします。

      ${text}
    `,
      },
    ],
  });

  return response.data.choices[0].message?.content || '';
};

const collectArticles = async (): Promise<ArticleWithSummary[]> => {
  const articlesByRssLists = await Promise.all(
    RSS_LIST.map(async (url) => {
      // RSS xmlをパース
      const feed = await parser.parseURL(url);
      // 1日以内の記事を抽出
      const startDate = moment().subtract(1, 'days');
      const endDate = moment();
      const articlesToday: Item[] = feed.items.filter((item: Item) => {
        if (!item.isoDate) return false;
        const itemDate = moment(new Date(item.isoDate));
        return itemDate.isBetween(startDate, endDate);
      });

      const contents = await Promise.all(
        articlesToday.map(async (item: Item) => {
          // 記事を要約
          const summary = await summarizeArticle(
            item.contentSnippet?.split('。').slice(0, 10).join('。') || '',
          );
          return {
            title: item.title || '記事タイトルなし',
            link: item.link || '記事リンクなし',
            summary,
          };
        }),
      );
      return {
        contents,
      };
    }),
  );

  // 記事をまとめる
  const articleList = articlesByRssLists.reduce((result, obj) => {
    return result.concat(obj.contents);
  }, [] as ArticleWithSummary[]);
  return articleList;
};

const constructSlackMessage = (articleList: ArticleWithSummary[]) => {
  return {
    text: '本日の記事はこちらです。',
    attachments: articleList.map((item) => {
      return {
        color: '#36a64f',
        title: item.title,
        title_link: item.link,
        fields: [
          {
            title: '要約',
            value: item.summary,
            short: false,
          },
        ],
      };
    }),
  };
};

exports.csSummarize = async (req: any, res: any) => {
  try {
    const articleList = await collectArticles();

    const message =
      articleList.length === 0
        ? '本日の記事はありませんでした。'
        : constructSlackMessage(articleList);

    await postToSlack(message);
    res.status(200);
  } catch (e) {
    console.error(e);
    res.status(500);
  }
};
