"use strict";

const Promise = require('bluebird');
const cheerio = require("cheerio");
const fs = Promise.promisifyAll(require('fs'));
const p = require('path');
const request = Promise.promisify(require("tinyreq"));

function userDetailUri(userId) {
  return `https://www.yelp.com/user_details_bookmarks?userid=${userId}`;
}

function processResponse(response) {
  if (response.error) throw new Error(response.error.description);
  return response;
}

function login(id, secret) {
  return request({
    url: 'https://api.yelp.com/oauth2/token',
    method: 'POST',
    data: {
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: secret
    }
  })
  .then(data => JSON.parse(data))
  .then(response => processResponse(response));
}

function lookupBusiness(bizId, token) {
  return request({
    url: `https://api.yelp.com/v3/businesses/${bizId}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(data => JSON.parse(data))
  .then(response => processResponse(response));
}

/**
 * This is a convenience wrapper allowing a user to download the content
 * of some provided uri, and scrape data out into a provided object shape.
 * Each key of the provided `data` object will represent a key in the
 * output, and the value of each of those keys is a function with the
 * following signature: ($, context). The `$` can be used like jquery on
 * the downloaded page, and `context` can be used to share data between
 * keys.
 *
 * @param {String} url the url of the page you desire to scrape
 * @param {Object} data object defining which properties to pull out
 * @return {Object}
 */
function scrape(url, data) {
  return request(url)
    .then(html => {
      const $ = cheerio.load(html);
      let result = {},
          ctx = {},
          keys = Object.keys(data);

      let preIdx = keys.indexOf('pre');
      if (preIdx !== -1) {
        data.pre($, ctx);
        keys.splice(preIdx, 1);
      }

      for (let i = 0; i < keys.length; ++i) {
        result[keys[i]] = data[keys[i]]($, ctx);
      }

      return result;
    });
};

/**
 * This is a fallback legacy method of scraping a business page by
 * downloading the full html, and extracting details using cheerio. It
 * should only be used in the event that Yelp's business API does not
 * provide data on this business.
 *
 * @param {String} bizUrl the url of the business to scrape
 * @return {Object}
 */
function scrapeBusiness(bizUrl) {
  return scrape(bizUrl, {
    pre: ($, ctx) => {
      ctx.ldjson = JSON.parse($('script[type="application/ld+json"]').text().trim())
      ctx.mapData = JSON.parse($('.lightbox-map').attr('data-map-state'));
    },

    url: $ => bizUrl,
    bizid: $ => $('meta[name=yelp-biz-id]').attr('content'),
    name: ($, ctx) => ctx.ldjson.name,
    address: ($, ctx) => {
      let { streetAddress, addressLocality, addressRegion } = ctx.ldjson.address;
      return `${streetAddress}, ${addressLocality}, ${addressRegion}`;
    },
    categories: $ => {
      let results = new Set;
      $('.category-str-list a').each((idx, elt) => results.add(elt.children[0].data.trim()));
      return Array.from(results);
    },
    rating: ($, ctx) => !!ctx.ldjson.aggregateRating ? ctx.ldjson.aggregateRating.ratingValue : 0,
    price_range: ($, ctx) => ctx.ldjson.priceRange || 'N/A',
    latitude: ($, ctx) => !!ctx.mapData ? ctx.mapData.center.latitude : 0.00,
    longitude: ($, ctx) => !!ctx.mapData ? ctx.mapData.center.longitude : 0.00
  });
}

const BASE_URI = 'https://www.yelp.com';
function bookmarkScrape(context) {
  const { appId, appSecret, output, userId, verbose } = context;
  const uri = userDetailUri(userId);

  let token;
  return login(appId, appSecret)
    .then(tokenData => {
      token = tokenData.access_token;
      return scrape(uri, {
        pageCount: $ => {
          const pageCountStr = $('div.page-of-pages').text().trim();
          const match = pageCountStr.match(/[0-9]+/g);
          return parseInt(match[1], 10);
        }
      });
    })
    .then(data => {
      let urls = [];
      for (let i = 0; i < data.pageCount; ++i) {
        urls.push(i === 0 ? uri : `${uri}&start=${i * 50}`);
      }

      return urls;
    })
    .map(url => scrape(url, {
      businesses: $ => {
        let result = [];
        $('a.biz-name').each((idx, elt) => result.push(elt.attribs.href));
        return result;
      }
    }))
    .reduce((businesses, pageData) => businesses.concat(pageData.businesses), [])
    .map(biz => {
      let bizId = biz.replace('/biz/', '');
      if (verbose) {
        console.log('scraping: ', bizId);
      }

      return lookupBusiness(bizId, token)
        .catch(err => {
          if (err.message.match(/We may not be able to provide details for certain businesses/)) {
            return scrapeBusiness(`${BASE_URI}${biz}`);
          }

          throw err; // rethrow
        });
    }, { concurrency: 10 })
    .then(data => {
      const out = JSON.stringify(data);
      if (output === 'stdout') {
        process.stdout.write(out);
      } else if (output === 'stderr') {
        process.stderr.write(out);
      } else {
        fs.writeFileAsync(outputFile, out);
      }
    });
}

module.exports = bookmarkScrape;
