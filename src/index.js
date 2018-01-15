import puppeteer from 'puppeteer';
import _ from 'lodash';

const exampleConfig = [
  {
    name: 'something',
    url: 'http://www.aavtrain.com/index.asp',
    fields: {
      user_name: 'Bobby',
      password: 'some password'
    }
  }
];

Promise.resolve().then(async () => {

  const browser = await puppeteer.launch();
  const promises = _.map(exampleConfig, async (pageConfig) => {
    const page = await browser.newPage();
    await page.goto(pageConfig.url);
    await page.evaluate((pageConfig) => {
      Object.keys(pageConfig.fields).forEach((fieldName) => {
        const field = pageConfig.fields[fieldName];
        document.getElementsByName(fieldName).forEach((element) => {
          if (typeof field === 'string') {
            element.value = field;
          } else {
            Object.keys(field).forEach((key) => {
              if (key !== 'name') element[key] = field[key];
            });
          }
        });
      });
    }, pageConfig);
    console.log(`Populated ${pageConfig.name}: ${pageConfig.url}`);
    await page.screenshot({ path: `${pageConfig.name}.png` })
  });
  await Promise.all(promises);
  await browser.close();

}).catch((err) => {
  console.error(err);
});
