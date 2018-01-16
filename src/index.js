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
    await page.addScriptTag({
      path: path.resolve(__dirname, '../node_modules/popform/umd/popform.min.js')
    })
    const boo = await page.evaluate((pageInfo) => {
      return window.popform(pageInfo.config);
    }, pageInfo);
    console.log(`Populated ${pageInfo.name}: ${pageInfo.url}`);
    if (commander.debug) await page.screenshot({ path: `${pageInfo.name}.debug.png` });
  });
  await Promise.all(promises);
  await browser.close();
}).catch((err) => {
  console.error(err);
});
