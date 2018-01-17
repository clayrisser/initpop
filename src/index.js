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
    return resolve(setEnvs(data.toString()));
  });
}).then((yamlData) => {
  return yaml.safeLoad(yamlData);
}).then(async (config) => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_BIN || null,
    args: ['--no-sandbox', '--headless', '--disable-gpu']
  });
  for (const pageInfo of config) {
    const page = await browser.newPage();
    page.on('console', (log) => console.log(log));
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
  }
  await browser.close();
}).catch((err) => {
  console.error(err);
});

async function popform({ name, url, delay, page, config }) {
  const _config = _.clone(config);
  delete _config.submit;
  delete _config.keys;
  delete _config.click;
  await page.addScriptTag('https://unpkg.com/popform@0.1.2/umd/popform.min.js');
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

function setEnvs(yamlData) {
  const matches = yamlData.match(/\${((\\})|[^}])*}/g);
  _.each(matches, (match) => {
    const env = getEnvFromMatch(match);
    yamlData = yamlData.replace(match, env);
  });
  return yamlData;
}

function getEnvFromMatch(match) {
  let envDefault = '';
  let envName = match.substr(2, match.length - 3);
  const index = envName.search(/[^\\]:/);
  if (index > -1) {
    envDefault = envName.substr(index + 2);
    envName = envName.substr(0, index + 1);
  }
  let env = process.env[envName];
  if (!env || env.length <= 0) env = envDefault;
  return env;
}
