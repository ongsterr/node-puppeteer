const puppeteer = require('puppeteer');
const mongoose = require('mongoose');

const CREDS = require('./creds');
const User = require('./models/user');

async function run() {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium-browser'
        // headless: false
    });
    const page = await browser.newPage();

    // await page.goto('https://github.com');
    // await page.screenshot({ path: 'screenshots/github.png' });

    await page.goto('https://github.com/login');
    
    // dom element selectors
    const USERNAME_SELECTOR = '#login_field';
    const PASSWORD_SELECTOR = '#password';
    const BUTTON_SELECTOR = '#login > form > div.auth-form-body.mt-3 > input.btn.btn-primary.btn-block';
    
    await page.click(USERNAME_SELECTOR);
    await page.keyboard.type(CREDS.username);
    
    await page.click(PASSWORD_SELECTOR);
    await page.keyboard.type(CREDS.password);
    
    await page.click(BUTTON_SELECTOR);
    
    await page.waitForNavigation();
    
    const userToSearch = 'john';
    const searchUrl = `https://github.com/search?q=${userToSearch}&type=Users&utf8=%E2%9C%93`;
    await page.goto(searchUrl);
    await page.waitFor(2 * 1000);
    
    const LIST_USERNAME_SELECTOR = '#user_search_results > div.user-list > div:nth-child(INDEX) > div.d-flex > div > a';
    const LIST_LOCATION_SELECTOR = '#user_search_results > div.user-list > div:nth-child(INDEX) > div.d-flex > div > ul > li:nth-child(1)';

    const LENGTH_SELECTOR_CLASS = 'user-list-item';
    let numPages = await getNumPages(page);

    console.log('Numpages: ', numPages);

    for (let h = 1; h <= numPages; h++) {

        let pageUrl = searchUrl + '&p=' + h;
        await page.goto(pageUrl);

        let listLength = await page.evaluate(sel => {
            return document.getElementsByClassName(sel).length
        }, LENGTH_SELECTOR_CLASS)
        console.log(listLength)

        for (let i = 1; i <= listLength; i++) {
            // change the index to the next child
            let usernameSelector = LIST_USERNAME_SELECTOR.replace("INDEX", i);
            let locationSelector = LIST_LOCATION_SELECTOR.replace("INDEX", i);


            let username = await page.evaluate(sel => {
                return document.querySelector(sel).getAttribute('href').replace('/', '');
            }, usernameSelector);

            let location = await page.evaluate(sel => {
                let element = document.querySelector(sel);
                return element ? element.innerText : null;
            }, locationSelector);

            // not all users have emails visible
            // if (email)
            //     continue;

            console.log(username, ' -> ', location);

            await upsertUser({
                username: username,
                location: location,
                dateCrawled: new Date()
            });
        }
        
    }

    browser.close();
}

async function getNumPages(page) {
    const NUM_USER_SELECTOR = '#js-pjax-container > div > div.columns > div.column.three-fourths.codesearch-results > div > div.d-flex.flex-justify-between.border-bottom.pb-3 > h3';

    let inner = await page.evaluate( sel => {
        let html = document.querySelector(sel).innerHTML;

        // format is: "69,803 users"
        return html.replace(',', '').replace('users', '').trim()
    }, NUM_USER_SELECTOR);

    let numUsers = parseInt(inner);

    // GitHub shows 10 resuls per page, so
    let numPages = Math.ceil(numUsers / 10);
    return numPages;
}

async function upsertUser(userObj) {
    const DB_URL = 'mongodb://localhost/Thal'
    const connection = mongoose.connection

    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(DB_URL);
    }

    connection.on('connected', () => {
        console.log('Establish connection to MongoDB')
    })

    // if this email exists, update the entry, don't insert
    let conditions = {
        location: userObj.location
    }
    let options = {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
    };

    User.findOneAndUpdate(conditions, userObj, options, (err, result) => {
        if (err) throw err;
    });
}

run();