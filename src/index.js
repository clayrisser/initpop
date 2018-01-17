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
    const waitUntil = pageInfo.networkIdle ? 'networkidle' : 'load';
    const networkIdleTimeout = Number(pageInfo.networkIdle) > 1 ? Number(pageInfo.networkIdle) : 1000;
    await page.goto(pageInfo.url, {
      waitUntil,
      networkIdleTimeout
    });
    if (_.isArray(pageInfo.config)) {
      let count = 0;
      for (const config of pageInfo.config) {
        await popform({
          name: `${pageInfo.name}-${count}`,
          url: pageInfo.url,
          page,
          waitUntil,
          networkIdleTimeout,
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

async function popform({ name, url, page, config, networkIdleTimeout, waitUntil }) {
  if (commander.debug) {
    await page.screenshot({ path: `${name}.before.debug.png` });
  }
  await page.evaluate((config) => {
    eval(`
      var contentDocument = document;
      if (config.iframe) contentDocument = document.querySelector(config.iframe).contentDocument;
      for (var key of Object.keys(config.fields || {})) {
        field = config.fields[key];
        for (var element of contentDocument.getElementsByName(key)) {
          element.focus();
          if (element.type === 'checkbox') {
            element.checked = !!value;
          } else {
            if (typeof field === 'string') {
              element.value = field;
            } else {
              for (var key of Object.keys(field || {})) {
                var value = field[key];
                if (elementConfig[key].constructor === Array) {
                  element[key] = element[key].concat(value);
                } else if (typeof element[key] === 'object') {
                  Object.assign(element[key], value);
                } else {
                  element[key] = value;
                }
              }
            }
          }
          element.dispatchEvent(new Event('change'));
          element.blur();
        }
      }
      for (var elementConfig of config.elements || []) {
        const element = contentDocument.querySelector(elementConfig.query);
        if (element) {
          if (elementConfig.field) element.focus();
          for (var key of Object.keys(elementConfig || {})) {
            value = elementConfig[key];
            if (key !== 'query' && key !== 'field') {
              if (elementConfig[key].constructor === Array) {
                element[key] = element[key].concat(value);
              } else if (typeof elementConfig[key] === 'object') {
                Object.assign(element[key], value);
              } else {
                element[key] = value;
              }
            }
          }
          if (elementConfig.field) {
            element.dispatchEvent(new Event('change'));
            element.blur();
          }
        }
      }
      if (config.click) {
        if (typeof config.click === 'string') {
          contentDocument.querySelector(config.click).click();
        } else {
          for (const query of config.click) {
            contentDocument.querySelector(query).click();
          }
        }
      }
    `)
  }, config);
  if (!config.click && !config.keys && config.delay) {
    await new Promise(r => setTimeout(r, config.delay));
  }
  if (config.click) {
    await page.waitForNavigation({
      timeout: config.delay || 10000,
      waitUntil,
      networkIdleTimeout
    }).catch(err => true);
  }
  if (config.keys) {
    for (const key of config.keys) {
      await Promise.all([
        page.keyboard.press(key),
        page.waitForNavigation({
          timeout: config.delay || 10000,
          waitUntil,
          networkIdleTimeout
        }).catch(err => true)
      ]);
    }
  }
  console.log(`Populated ${name}: ${url}`);
  if (commander.debug) {
    await page.screenshot({ path: `${name}.after.debug.png` });
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
