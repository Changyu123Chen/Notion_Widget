
# Notion Financial Calculator

## Project Overview
This project is used to calculate financial-related data within Notion databases. It provides endpoints to recompute accounts, daily balances, and budgets, and to check server health.

## Endpoints
- **POST `/api/run-daily`**  
  Recomputes Accounts, Daily Balances, and Budgets.
- **GET `/api/health`**  
  Returns ok if the server is running.

## Environment Variables
You will need to set the following environment variables:
- `NOTION_KEY`: Your Notion integration secret key.
- `NOTION_DATABASE_ID`: The ID of your Notion database.
- `NOTION_ACCOUNTS_ID`: The ID of your Notion accounts database.
- `NOTION_BUDGETS_ID`: The ID of your Notion budgets database.

You can add these to a `.env` file in the root directory:
```env
NOTION_KEY=your_notion_integration_secret
NOTION_DATABASE_ID=your_database_id
NOTION_ACCOUNTS_ID=your_accounts_database_id
NOTION_BUDGETS_ID=your_budgets_database_id
```

## Local Development
1. Clone the repository:
   ```sh
   git clone <repository-url>
   cd Notion_Financial_DB_Auth
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Set up your `.env` file as described above.
4. Run the development server:
   ```sh
   npm run dev
   ```
5. The API will be available at `http://localhost:3000`.

## Deployment
This project can be deployed to [Vercel](https://vercel.com/):
1. Push your code to a GitHub repository.
2. Import your repository into Vercel.
3. Set the required environment variables in the Vercel dashboard.
4. Deploy your project.

## Notion Setup
1. [Create a Notion integration](https://developers.notion.com/docs/create-a-notion-integration) and save the integration secret.
2. Share your Notion databases (Accounts, Budgets, etc.) with your integration.
3. Get the database IDs for use in your environment variables.

