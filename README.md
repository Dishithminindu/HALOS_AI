# HALOS — AI-Assisted Dietary Salt Intake Assessment & Prediction System

Static research prototype using HTML5, CSS3, Vanilla JavaScript and JSON.

## Run locally
Open `index.html`. For the food database `fetch()` to work reliably, use a simple static server such as VS Code Live Server.

## GitHub
Create `halos-dietary-ai`, upload the entire folder structure, commit and push.

## Cloudflare Pages
Connect the GitHub repository to Cloudflare Pages. For this static version use **no build command** and the repository root as the output directory.

## Food database
`data/food-database.json` contains example/demo values only. Replace them with a validated food-composition database before research use.

## Future ML
`js/prediction.js` contains `predictSaltIntake(features)`. It is a demonstration model. Replace it later with a secure HTTPS call to a Python FastAPI/Flask service running a properly trained/evaluated model.

Never place API keys or secrets in frontend JavaScript.

## Privacy
Browser localStorage is for demonstration/prototyping only and is not secure clinical storage. Do not store identifiable patient health information.

## Disclaimer
HALOS is a research prototype and does not provide medical diagnosis or treatment recommendations.
