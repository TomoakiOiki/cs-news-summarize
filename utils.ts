import fetch from 'node-fetch';
const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export const constructSlackMessage = (article: ArticleWithSummary) => {
    return {
        attachments: [
            {
                color: '#36a64f',
                title: article.title,
                title_link: article.link,
                fields: [
                    {
                        title: '要約',
                        value: article.summary,
                        short: false,
                    },
                    {
                        title: 'Created',
                        value: article.date,
                        short: false,
                    },
                ],
            },
        ],
    };
};

export const removeDuplicateArticlesByKey = (arr: any[], key: string) => {
    const uniqueKeys = new Set();
    const uniqueArray = [];

    for (const obj of arr) {
        if (!uniqueKeys.has(obj[key])) {
            uniqueKeys.add(obj[key]);
            uniqueArray.push(obj);
        }
    }

    return uniqueArray;
}

export const postToSlack = async (data: any) => {
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
