const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const LINKEDIN_URL = 'https://www.linkedin.com';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const SCROLL_DELAY = 1000; // 1 second between scrolls
const PROFILES_TO_SCRAPE = 10; // Adjust as needed

/**
 * Helper function for consistent waiting
 */
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main function to run the LinkedIn scraper
 */
async function main() {
  try {
    // Get command line arguments
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
      console.log('Usage: node index.js "<company_url>"');
      console.log('Example: node index.js "https://www.linkedin.com/company/blackbaud/people/?facetCurrentFunction=8"');
      console.log('\nNOTE: Make sure to put the URL in quotes to avoid shell issues with special characters.');
      process.exit(1);
    }

    const companyUrl = args[0];
    
    // Extract company name from URL
    const companyNameMatch = companyUrl.match(/company\/([^\/]+)/);
    const companyName = companyNameMatch ? companyNameMatch[1] : 'company';
    
    console.log(`Starting LinkedIn scraper for ${companyName}...`);
    console.log('\n-------------------------------------------------------------');
    console.log('ATTEMPTING TO CONNECT TO YOUR CHROME BROWSER');
    console.log('Make sure Chrome is running with remote debugging enabled:');
    console.log('Mac: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222');
    console.log('Windows: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222');
    console.log('Linux: google-chrome --remote-debugging-port=9222');
    console.log('And that you\'re logged into LinkedIn in that browser');
    console.log('-------------------------------------------------------------\n');
    
    let browser;
    try {
      // Try to connect to the existing browser instance
      console.log('Attempting to connect to Chrome on port 9222...');
      browser = await puppeteer.connect({
        browserURL: 'http://localhost:9222',
        defaultViewport: null
      });
      console.log('Successfully connected to Chrome browser!');
    } catch (error) {
      console.error('Failed to connect to Chrome browser:', error.message);
      console.log('\nThere are two options to fix this:');
      console.log('\nOption 1: Start Chrome manually with remote debugging enabled:');
      console.log('Mac: Open Terminal and run:');
      console.log('"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-profile"');
      console.log('\nWindows: Open Command Prompt and run:');
      console.log('"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\\chrome-profile"');
      console.log('\nLinux: Open Terminal and run:');
      console.log('google-chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-profile"');
      console.log('\nOption 2: Let the script launch Chrome for you? (y/n)');
      
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        readline.question('> ', resolve);
      });
      readline.close();
      
      if (answer.toLowerCase() === 'y') {
        console.log('Launching Chrome browser...');
        try {
          browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: [
              '--remote-debugging-port=9222',
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage'
            ],
            ignoreDefaultArgs: ['--enable-automation']
          });
          
          console.log('Chrome launched successfully!');
          console.log('IMPORTANT: You need to log in to LinkedIn manually in the opened browser.');
          console.log('After logging in, press Enter to continue...');
          
          await new Promise(resolve => {
            const rl = require('readline').createInterface({
              input: process.stdin,
              output: process.stdout
            });
            rl.question('Press Enter to continue after logging in...', () => {
              rl.close();
              resolve();
            });
          });
        } catch (launchError) {
          console.error('Failed to launch Chrome:', launchError.message);
          process.exit(1);
        }
      } else {
        console.log('Exiting script. Please restart it after starting Chrome with remote debugging.');
        process.exit(1);
      }
    }
    
    // Create a new page/tab in the existing browser
    console.log('Opening new tab in Chrome...');
    const page = await browser.newPage();
    await page.setDefaultTimeout(DEFAULT_TIMEOUT);
    
    // Navigate to company page
    console.log(`Navigating to ${companyUrl}...`);
    await page.goto(companyUrl, { waitUntil: 'networkidle2' });
    console.log(`Navigated to ${companyName}'s people page`);
    
    // Find profiles by scrolling to the people section
    console.log('Looking for employee profiles...');
    const profileUrls = await findProfilesInCompanyPage(page, PROFILES_TO_SCRAPE, companyName);
    console.log(`Found ${profileUrls.length} employee profiles`);
    
    if (profileUrls.length === 0) {
      console.error('No employee profiles found. The script may not be correctly identifying profiles.');
      console.log('Make sure you\'re on a company page that shows employees.');
      await browser.disconnect();
      process.exit(1);
    }
    
    // Visit each profile and extract information
    console.log('Starting to extract profile information...');
    const profileData = [];
    for (let i = 0; i < profileUrls.length; i++) {
      try {
        console.log(`Processing profile ${i+1} of ${profileUrls.length}: ${profileUrls[i]}`);
        const profileInfo = await extractProfileInfo(browser, profileUrls[i], companyName);
        if (profileInfo) {
          profileData.push(profileInfo);
          console.log(`Successfully processed ${profileInfo.name}`);
        }
      } catch (error) {
        console.error(`Error processing profile ${profileUrls[i]}:`, error.message);
      }
      
      // Add delay to avoid rate limiting
      await delay(2000);
    }
    
    // Save data to CSV
    await saveToCSV(profileData, companyName);
    
    console.log('Finished scraping LinkedIn profiles');
    
    // Disconnect from browser but don't close it (since it's user's browser)
    await browser.disconnect();
    console.log('Disconnected from browser. You can close it manually.');
    
  } catch (error) {
    console.error('An error occurred:', error);
    process.exit(1);
  }
}

/**
 * Find profiles in the company page by scrolling to find people
 */
async function findProfilesInCompanyPage(page, maxProfiles, companyName) {
  const profileUrls = new Set();
  let previousHeight = 0;
  let scrollAttempts = 0;
  const maxScrollAttempts = 15; // Increased from 10 to give more chances to find profiles
  
  console.log('Scrolling to find employee profiles...');
  
  // First check if we're on a page with profiles
  console.log('Looking for profile links on the page...');
  
  // Try multiple selectors that might contain profile links
  const initialProfiles = await page.evaluate(() => {
    // More comprehensive set of selectors for LinkedIn profile links
    const selectors = [
      'a.app-aware-link[href*="/in/"]', // Standard profile links
      'a[href*="/in/"]', // Any link with /in/ path
      '.org-people-profile-card__profile-title a', // Profile cards on company pages
      '.org-people-profile-card a', // Newer profile card links
      '.org-people__list-item a', // List items in people section
      'a[data-control-name="people_profile_card_name_link"]', // Name links in profile cards
      '.feed-shared-update-v2__description-wrapper a[href*="/in/"]' // Links in feed updates
    ];
    
    let links = [];
    
    // Try each selector and collect links
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`Found ${elements.length} elements with selector: ${selector}`);
      }
      
      elements.forEach(element => {
        if (element.href && element.href.includes('/in/')) {
          links.push({
            url: element.href,
            text: element.innerText.trim() || 'Profile'
          });
        }
      });
    }
    
    // Remove duplicates by URL
    const uniqueLinks = Array.from(
      new Map(links.map(link => [link.url, link])).values()
    );
    
    return uniqueLinks;
  });
  
  // Log diagnostic information
  console.log(`Initial scan found ${initialProfiles.length} potential profile links`);
  if (initialProfiles.length > 0) {
    console.log('Sample profile links found:');
    initialProfiles.slice(0, 3).forEach(profile => {
      console.log(`- ${profile.text}: ${profile.url}`);
    });
  }
  
  initialProfiles.forEach(profile => profileUrls.add(profile.url));
  console.log(`Found ${profileUrls.size} unique profile URLs without scrolling`);
  
  // If we already have enough profiles, return them
  if (profileUrls.size >= maxProfiles) {
    return Array.from(profileUrls).slice(0, maxProfiles);
  }
  
  // Otherwise, scroll to find more profiles
  while (profileUrls.size < maxProfiles && scrollAttempts < maxScrollAttempts) {
    scrollAttempts++;
    
    console.log(`Scroll attempt #${scrollAttempts}: Looking for more profiles...`);
    
    // Scroll down to load more content
    previousHeight = await page.evaluate('document.body.scrollHeight');
    await page.evaluate('window.scrollBy(0, 800)'); // Scroll a bit more aggressively
    await delay(SCROLL_DELAY * 1.5); // Wait a bit longer to ensure content loads
    
    // Check if we've reached the bottom
    const currentHeight = await page.evaluate('document.body.scrollHeight');
    if (currentHeight === previousHeight && scrollAttempts > 3) {
      console.log('Reached the end of the page or no more content is loading');
      break;
    }
    
    // Extract any new profile URLs after scrolling using the same comprehensive approach
    const newProfiles = await page.evaluate(() => {
      // Same selectors as above
      const selectors = [
        'a.app-aware-link[href*="/in/"]',
        'a[href*="/in/"]',
        '.org-people-profile-card__profile-title a',
        '.org-people-profile-card a',
        '.org-people__list-item a',
        'a[data-control-name="people_profile_card_name_link"]',
        '.feed-shared-update-v2__description-wrapper a[href*="/in/"]'
      ];
      
      let links = [];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          if (element.href && element.href.includes('/in/')) {
            links.push({
              url: element.href,
              text: element.innerText.trim() || 'Profile'
            });
          }
        });
      }
      
      // Remove duplicates by URL
      const uniqueLinks = Array.from(
        new Map(links.map(link => [link.url, link])).values()
      );
      
      return uniqueLinks;
    });
    
    const previousSize = profileUrls.size;
    newProfiles.forEach(profile => profileUrls.add(profile.url));
    
    console.log(`Scroll #${scrollAttempts}: Found ${profileUrls.size} profiles total (${profileUrls.size - previousSize} new)`);
    
    // If we haven't found any new profiles in 3 consecutive attempts, try clicking "Show more results"
    if (previousSize === profileUrls.size && scrollAttempts % 3 === 0) {
      console.log('Trying to click "Show more" button...');
      try {
        // Try to find and click "Show more" button
        const clicked = await page.evaluate(() => {
          const showMoreButtons = Array.from(document.querySelectorAll('button, .artdeco-button'))
            .filter(button => {
              const text = button.innerText.toLowerCase();
              return text.includes('show more') || 
                     text.includes('see more') || 
                     text.includes('load more') ||
                     text.includes('view more');
            });
          
          if (showMoreButtons.length > 0) {
            showMoreButtons[0].click();
            return true;
          }
          return false;
        });
        
        if (clicked) {
          console.log('Clicked "Show more" button, waiting for content to load...');
          await delay(3000); // Wait longer for content to load after clicking
        }
      } catch (error) {
        console.log('No "Show more" button found or error clicking it');
      }
    }
  }
  
  const foundProfiles = Array.from(profileUrls).slice(0, maxProfiles);
  console.log(`Returning ${foundProfiles.length} profile URLs for processing`);
  
  return foundProfiles;
}

/**
 * Extract information from a LinkedIn profile page
 */
async function extractProfileInfo(browser, profileUrl, targetCompany) {
  // Create a new tab for the profile
  const page = await browser.newPage();
  await page.setDefaultTimeout(DEFAULT_TIMEOUT);
  
  try {
    console.log(`Opening profile: ${profileUrl}`);
    await page.goto(profileUrl, { waitUntil: 'networkidle2' });
    
    // Extract name
    const name = await page.evaluate(() => {
      // Try multiple selectors for the name as LinkedIn's UI changes frequently
      const nameSelectors = [
        'h1.text-heading-xlarge',
        'h1.inline.t-24.t-black.t-normal.break-words',
        'h1.text-body-mega',
        'h1.pv-top-card-section__name',
        'h1.t-24.t-black.t-normal'
      ];
      
      for (const selector of nameSelectors) {
        const nameElement = document.querySelector(selector);
        if (nameElement) {
          return nameElement.innerText.trim();
        }
      }
      
      return 'Unknown';
    });
    console.log(`Processing profile: ${name}`);
    
    // Extract headline/title
    const headline = await page.evaluate(() => {
      const titleSelectors = [
        '.ph5.pb5 .text-body-medium',
        '.pv-top-card-section__headline',
        '.text-body-medium.break-words',
        '.ph5.pb5 span.text-body-medium'
      ];
      
      for (const selector of titleSelectors) {
        const titleElement = document.querySelector(selector);
        if (titleElement) {
          return titleElement.innerText.trim();
        }
      }
      
      return '';
    });
    
    // Scroll to experience section
    console.log('Scrolling to experience section...');
    await scrollToExperience(page);
    
    // Take a short pause to let any lazy-loaded content appear
    await delay(2000);
    
    // Extract experience information for the target company
    console.log(`Looking for experience at ${targetCompany}...`);
    const workSummary = await page.evaluate((company) => {
      // Try to find any mentions of the company in the page content first
      const pageText = document.body.innerText.toLowerCase();
      if (!pageText.includes(company.toLowerCase())) {
        return `No mentions of ${company} found on profile`;
      }
      
      // Various possible selectors for experience sections
      let experienceSections = [];
      
      // First try to find the experience section
      const experienceSection = 
        document.querySelector('#experience-section') || 
        document.querySelector('section.experience-section') || 
        document.querySelector('#experience') ||
        document.querySelector('section[id*="experience"]');
      
      if (experienceSection) {
        // If we found the main section, look for company mentions within it
        experienceSections = Array.from(
          experienceSection.querySelectorAll('li, .pvs-entity')
        ).filter(section => {
          const text = section.textContent.toLowerCase();
          return text.includes(company.toLowerCase());
        });
      } else {
        // If we couldn't find the section, search more broadly
        experienceSections = Array.from(
          document.querySelectorAll('section li, .pvs-list__outer-container .pvs-entity')
        ).filter(section => {
          const text = section.textContent.toLowerCase();
          return text.includes(company.toLowerCase());
        });
      }
      
      if (experienceSections.length === 0) {
        return `Could not find specific experience details for ${company}`;
      }
      
      let summary = '';
      
      experienceSections.forEach(section => {
        // Just grab all text from the section as LinkedIn's DOM structure changes frequently
        summary += section.innerText.trim() + '\n\n';
      });
      
      return summary.trim();
    }, targetCompany);
    
    console.log(`Finished extracting data for ${name}. Closing profile tab...`);
    await page.close();
    
    return {
      name,
      headline,
      workSummary
    };
  } catch (error) {
    console.error(`Error extracting profile info for ${profileUrl}:`, error.message);
    await page.close();
    return null;
  }
}

/**
 * Scroll to the experience section of a profile page
 */
async function scrollToExperience(page) {
  const result = await page.evaluate(() => {
    // Try multiple possible selectors for experience section
    const experienceSelectors = [
      '#experience-section',
      'section.experience-section', 
      'section[id*="experience"]',
      '#experience',
      'section[aria-label*="Experience"]',
      'section[aria-label*="experience"]'
    ];
    
    for (const selector of experienceSelectors) {
      const experienceSection = document.querySelector(selector);
      if (experienceSection) {
        experienceSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { found: true, selector };
      }
    }
    
    // If can't find experience section, scroll down gradually
    window.scrollBy(0, window.innerHeight / 2);
    return { found: false };
  });
  
  if (result.found) {
    console.log(`Found experience section with selector: ${result.selector}`);
  } else {
    console.log('Could not find a specific experience section, scrolled down instead');
  }
  
  await delay(2000); // Give time for any lazy-loaded content to appear
}

/**
 * Save the extracted profile data to a CSV file
 */
async function saveToCSV(data, companyName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${companyName}-profiles-${timestamp}.csv`;
  const filePath = path.join(__dirname, fileName);
  
  const csvWriter = createCsvWriter({
    path: filePath,
    header: [
      { id: 'name', title: 'Name' },
      { id: 'headline', title: 'Headline/Title' },
      { id: 'workSummary', title: 'Work Summary' }
    ]
  });
  
  await csvWriter.writeRecords(data);
  console.log(`Data saved to ${fileName}`);
  console.log(`Full path: ${filePath}`);
}

// Run the script
main().catch(console.error);