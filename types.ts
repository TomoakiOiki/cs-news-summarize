type ArticleWithSummary = {
    title: string;
    link: string;
    date: string;
    summary: string;
};

type RssItem = {
    siteName: string;
    url: string;
    skipSummarize?: boolean;
};
