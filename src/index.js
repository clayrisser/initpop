import puppeteer from 'puppeteer';
import _ from 'lodash';

const exampleConfig = [
  {
    name: 'something',
    url: 'http://www.aavtrain.com/index.asp',
    config: {
      delay: 0,
      fields: {
        user_name: 'Bobby',
        password: 'some password'
      }
    }
  }
];

Promise.resolve().then(async () => {

  const browser = await puppeteer.launch();
  const promises = _.map(exampleConfig, async (pageInfo) => {
    const page = await browser.newPage();
    page.on('console', (log) => console[log._type](log._text));
    await page.goto(pageInfo.url);
    await page.addScriptTag({ path: './node_modules/popform/umd/popform.min.js'})
    const boo = await page.evaluate((pageInfo) => {
      return window.popform(pageInfo.config);
    }, pageInfo);
    console.log(`Populated ${pageInfo.name}: ${pageInfo.url}`);
    await page.screenshot({ path: `${pageInfo.name}.png` })
  });
  await Promise.all(promises);
  await browser.close();

}).catch((err) => {
  console.error(err);
});
