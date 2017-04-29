# yelp-bookmark-scraper
node script to scrape bookmarks for a yelp userid

### install
```
npm install
```

### usage

Either as a module in your own project
```
const scrapeBookmarks = require('./path/to/yelp-bookmark-scraper');

scrapeBookmarks({
  appId: 'my-yelp-app-oauth-id',
  appSecret: 'my-yelp-app-oauth-secret',
  output: <path> /* one of: ['stdin', 'stdout', 'path/to/file'] */,
  userId: 'the-user-id-you-wish-to-scrape-for',
  verbose: true
});
```

Or using the provided binary in `bin/yelp-scrape-bookmarks`
```
mbroadst@gorgor:~/Development/node/yelp-bookmark-scraper (master %)$ ./bin/yelp-bookmark-scraper
bin/yelp-bookmark-scraper [args]

Options:
  --help           Show help  [boolean]
  --userId, -u     user id to scrape bookmarks for  [string] [required]
  --appId, -a      yelp app-id (for oauth)  [string] [required]
  --appSecret, -s  yelp app-secret (for oauth)  [string] [required]
  --output, -o     file to dump output to  [string] [default: "stdout"]
  --verbose, -v    verbose mode  [boolean] [required] [default: false]
```
