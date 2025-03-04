#!/bin/bash

# Display instructions for starting Chrome with remote debugging
echo "Before running this script, make sure Chrome is running with remote debugging enabled:"
echo ""
echo "On Mac, open a Terminal and run:"
echo '"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-profile"'
echo ""
echo "On Windows, open Command Prompt and run:"
echo '"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-profile"'
echo ""
echo "On Linux, open Terminal and run:"
echo 'google-chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-profile"'
echo ""
echo "Then log in to LinkedIn in that Chrome window."
echo ""

# Ask user to confirm Chrome is running with debugging
read -p "Have you started Chrome with remote debugging and logged into LinkedIn? (y/n): " answer

if [[ $answer != "y" && $answer != "Y" ]]; then
  echo "Please start Chrome with remote debugging and try again."
  exit 1
fi

# Check if a URL is provided
if [ "$#" -ne 1 ]; then
    echo "Usage: ./run.sh <company_url>"
    echo "Example: ./run.sh https://www.linkedin.com/company/blackbaud/people/?facetCurrentFunction=8"
    exit 1
fi

# Run the Node.js script with the URL properly quoted
node index.js "$1"
