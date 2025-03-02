# LinkedIn Scribe

A tool to scrape LinkedIn company profiles for employee information and save it to CSV.

## Features

- Navigates to a specified company's LinkedIn profile page
- Scrolls through employee profiles
- Extracts information from each profile, focusing on their experience at the target company
- Saves the collected data to a CSV file

## Installation

```bash
# Clone the repository
git clone https://github.com/shreyk1004/linkedin-scribe.git
cd linkedin-scribe

# Install dependencies
npm install
```

## Configuration

1. Create a `.env` file in the root directory
2. Add your LinkedIn credentials:
```
LINKEDIN_EMAIL=your_email@example.com
LINKEDIN_PASSWORD=your_password
```

## Usage

After setting up your `.env` file, run the script with the target company URL:

```bash
npm start "<company_url>"
```

Example:
```bash
npm start "https://www.linkedin.com/company/blackbaud/people/?facetCurrentFunction=8"
```

⚠️ **Important:** Always put the URL in quotes to prevent the shell from interpreting special characters like `?` and `&`.

The URL should be a LinkedIn company page with appropriate filters applied. The example above targets all Engineering employees at Blackbaud.

## Output

The script will create a CSV file with the following columns:
- **Name**: The name of the LinkedIn profile owner
- **Work Summary**: A summary of the person's work experience at the target company

The CSV file will be named with the pattern: `{company-name}-profiles-{timestamp}.csv`

## Additional Configuration

You can adjust the following constants in the `index.js` file:

- `DEFAULT_TIMEOUT`: The timeout for page loading operations (default: 30000 ms)
- `SCROLL_DELAY`: Delay between scrolls (default: 1000 ms)
- `PROFILES_TO_SCRAPE`: Maximum number of profiles to scrape (default: 10)

## Notes

- The script opens a visible browser by default (`headless: false`). For production use, you can change this to `headless: true` in the code.
- LinkedIn may detect automation and could temporarily restrict your account if you scrape too many profiles too quickly.
- This tool is for educational purposes only. Please respect LinkedIn's terms of service.
- Keep your `.env` file secure and do not commit it to version control.