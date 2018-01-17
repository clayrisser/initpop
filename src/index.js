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
  if (_.isArray(config)) {
    for (const pageInfo of config) {
      await initpop(pageInfo, browser);
    }
  } else {
    await initpop(config, browser);
  }
  await browser.close();
}).catch((err) => {
  console.error(err);
});

async function initpop(pageInfo, browser) {
  const page = await browser.newPage();
  page.on('console', (log) => console.log(log));
  const waitUntil = pageInfo.networkIdle ? 'networkidle' : 'load';
  const networkIdleTimeout = Number(pageInfo.networkIdle) > 1 ? Number(pageInfo.networkIdle) : 1000;
  await page.goto(pageInfo.url, {
    waitUntil,
    networkIdleTimeout
  });
  if (pageInfo.steps) {
    let count = 0;
    for (const step of pageInfo.steps) {
      if (step.description) console.log(step.description);
      await popform({
        name: `${pageInfo.name}-${count}`,
        url: pageInfo.url,
        page,
        waitUntil,
        networkIdleTimeout,
        step
      });
      count++;
    }
  } else {
    if (pageInfo.description) console.log(pageInfo.description);
    await popform({
      name: pageInfo.name,
      url: pageInfo.url,
      page,
      waitUntil,
      networkIdleTimeout,
      step: {
        fields: pageInfo.fields,
        click: pageInfo.click,
        elements: pageInfo.elements,
        keys: pageInfo.keys,
        description: pageInfo.description,
        delay: pageInfo.delay
      }
    });
  }
  console.log(pageInfo.message || `${pageInfo.name} initialized successfully`);
}

async function popform({ name, url, page, step, networkIdleTimeout, waitUntil }) {
  if (commander.debug) {
    await page.screenshot({ path: `${name}.before.debug.png` });
  }
  await page.evaluate((step) => {
    eval(`
      var contentDocument = document;
      if (step.iframe) contentDocument = document.querySelector(step.iframe).contentDocument;
      for (var key of Object.keys(step.fields || {})) {
        field = step.fields[key];
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
      for (var elementConfig of step.elements || []) {
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
      if (step.click) {
        if (typeof step.click === 'string') {
          contentDocument.querySelector(step.click).click();
        } else {
          for (const query of step.click) {
            contentDocument.querySelector(query).click();
          }
        }
      }
    `)
  }, step);
  if (!step.click && !step.keys && step.delay) {
    await new Promise(r => setTimeout(r, step.delay));
  }
  if (step.click) {
    await page.waitForNavigation({
      timeout: step.delay || 10000,
      waitUntil,
      networkIdleTimeout
    }).catch(err => true);
  }
  if (step.keys) {
    for (const key of step.keys) {
      await Promise.all([
        page.keyboard.press(key),
        page.waitForNavigation({
          timeout: step.delay || 10000,
          waitUntil,
          networkIdleTimeout
        }).catch(err => true)
      ]);
    }
  }
  if (commander.debug) {
    console.log(`populated ${name}: ${url}`);
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
