#!/bin/bash

# Check if a URL is provided
if [ "$#" -ne 1 ]; then
    echo "Usage: ./run.sh <company_url>"
    echo "Example: ./run.sh https://www.linkedin.com/company/blackbaud/people/?facetCurrentFunction=8"
    exit 1
fi

# Run the Node.js script with the URL properly quoted
node index.js "$1"
