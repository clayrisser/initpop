#!/usr/bin/env node

import puppeteer from 'puppeteer';
import _ from 'lodash';
import yaml from 'js-yaml';
import fs from 'fs';
import commander from 'commander';
import { version } from '../package';
import path from 'path';

commander.version(version);
commander.arguments('<path>');
commander.option('-d --debug', 'enable debug mode');
commander.parse(process.argv);

const configPath = path.resolve(commander.args[0]);

new Promise((resolve, reject) => {
  fs.readFile(configPath, (err, data) => {
    if (err) return reject(err);
    return resolve(yaml.safeLoad(data.toString()));
  });
}).then(async (config) => {
  const browser = await puppeteer.launch();
  const promises = _.map(config, async (pageInfo) => {
    const page = await browser.newPage();
    page.on('console', (log) => console[log._type](log._text));
    await page.goto(pageInfo.url);
    if (_.isArray(pageInfo.config)) {
      let count = 0;
      for (const config of pageInfo.config) {
        await popform({
          name: `${pageInfo.name}-${count}`,
          url: pageInfo.url,
          delay: pageInfo.delay,
          page,
          config
        });
        count++;
      }
    } else {
      await popform({
        name: pageInfo.name,
        url: pageInfo.url,
        delay: pageInfo.delay,
        page,
        config: pageInfo.config
      });
    }
  });
  await Promise.all(promises);
  await browser.close();
}).catch((err) => {
  console.error(err);
});

async function popform({ name, url, delay, page, config }) {
  const _config = _.clone(config);
  delete _config.submit;
  delete _config.keys;
  delete _config.click;
  await page.addScriptTag({
    path: path.resolve(__dirname, '../node_modules/popform/umd/popform.min.js')
  })
  await page.evaluate((config) => {
    return window.popform(config);
  }, _config);
  if (config.click) {
    for (const query of config.click) {
      await Promise.all([
        page.click(query),
        page.waitForNavigation({
          timeout: config.delay || 10000
        }).catch(err => true)
      ]);
    }
  }
  if (config.keys) {
    for (const key of config.keys) {
      await Promise.all([
        page.keyboard.press(key),
        page.waitForNavigation({
          timeout: config.delay || 10000
        }).catch(err => true)
      ]);
    }
  }
  console.log(`Populated ${name}: ${url}`);
  if (commander.debug) {
    await page.screenshot({ path: `${name}.debug.png` });
  }
}
