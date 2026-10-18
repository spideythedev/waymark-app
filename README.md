# WAYMARK

WAYMARK is an education and opportunity guidance platform focused on
helping students find options relevant to their qualifications,
preferences, constraints, and goals.

## Principles

- Use real, traceable sources.
- Do not fabricate institutions, courses, opportunities, fees, or dates.
- Separate data validation from factual verification.
- Preserve source provenance.
- Track freshness for time-sensitive information.
- Match opportunities against relevant student requirements.
- Explain uncertainty instead of presenting guesses as facts.
- Show understandable errors to users without exposing internal details.

## Initial architecture

- `api/`: server-side API endpoints.
- `data/`: source registry and reference data.
- `ingestion/`: normalization, validation, and deduplication.
- `assets/`: application assets.
- `*.html`: frontend pages with their own CSS and JavaScript.

## Development

Requirements:

- Node.js 20 or newer
- A GitHub repository
- A Vercel project for deployment

Run the ingestion module check:

    npm run check:ingestion

## API health check

After deployment, open:

    /api/health

A successful response confirms that the health endpoint is responding.
It does not confirm that external data sources or other services are
available.

## Data policy

No record should be described as verified unless its factual claims
have appropriate supporting evidence.

A structurally valid record is not necessarily factually accurate.

Unavailable information must remain unknown until it can be established
from a suitable source.

## Current limitations

The source registry is an inventory, not a live data integration.

The initial project does not yet provide:

- Firebase authentication
- Student profiles
- Live college or course search
- Automated counselling ingestion
- Job or internship ingestion
- Eligibility matching
- AI guidance

These capabilities must be implemented and tested before being
advertised as available.