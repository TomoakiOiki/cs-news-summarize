require('dotenv').config();
const Parser = require('rss-parser');
const parser = new Parser();
const moment = require('moment');
const { convert } = require('html-to-text');
import { Configuration, OpenAIApi } from 'openai';
import { Item } from 'rss-parser';
import { constructSlackMessage, postToSlack, removeDuplicateArticlesByKey } from './utils';

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const RSS_LIST: RssItem[] = [
  {
    siteName: 'コールセンタージャパン',
    url: 'https://callcenter-japan.com/index.rdf',
  },
  {
    siteName: 'CXジャーナル',
    url: 'https://aisaas.pkshatech.com/cx-journal/rss.xml',
  },
  {
    siteName: 'Zendesk',
    url: 'https://www.zendesk.co.jp/public/assets/sitemaps/ja/feed.xml',
  },
  {
    siteName: 'karakuri',
    url: 'https://karakuri.ai/column/feed/',
  },
  {
    siteName: 'fonolo',
    url: 'https://fonolo.com/feed/',
  },
  {
    siteName: 'googleアラート:カスタマーサポート',
    url: 'https://www.google.co.jp/alerts/feeds/02964304067010012541/1190025537737363760',
    skipSummarize: true,
  },
  {
    siteName: 'googleアラート:コールセンター',
    url: 'https://www.google.co.jp/alerts/feeds/02964304067010012541/1190025537737365130',
    skipSummarize: true,
  }
];

const summarizeArticle = async (text: string): Promise<string> => {
  if (!text) return '';
  try {
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
    return (
      response.data.choices[0].message?.content || '記事の要約に失敗しました。'
    );
  } catch (e) {
    console.error(e);
    return '記事の要約に失敗しました。';
  }
};

const collectArticles = async (): Promise<ArticleWithSummary[]> => {
  const articlesByRssLists = await Promise.all(
    RSS_LIST.map(async ({ siteName, url, skipSummarize }) => {
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

      // 記事の重複を排除
      const articles = removeDuplicateArticlesByKey(articlesToday, 'title');

      const contents = await Promise.all(
        articles.map(async (item: Item) => {
          const date = new Date(item.isoDate || '');
          const plainTitle = convert(item.title || '')
          console.log(item);
          return {
            title: `${plainTitle} - ${siteName}` || '記事タイトルなし',
            link: item.link || '記事リンクなし',
            date: date.toLocaleString('ja-JP'),
            summary: skipSummarize ? '要約なし' : await summarizeArticle(
              item.contentSnippet?.split('。').slice(0, 10).join('。') || '',
            ),
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

exports.csSummarize = async (req: any, res: any) => {
  try {
    const articleList = await collectArticles();

    const message =
      articleList.length === 0
        ? '本日の記事はありませんでした'
        : '本日の記事はこちらです';
    await postToSlack({
      text: message,
    });

    for (let i = 0; i < articleList.length; i++) {
      const article = articleList[i];
      await postToSlack(constructSlackMessage(article));
    }
    res.status(200);
  } catch (e) {
    console.error(e);
    res.status(500);
  }
};
