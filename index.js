import 'dotenv/config';
import { Client } from '@notionhq/client';

const { NOTION_TOKEN, NOTION_PAGE_ID } = process.env;

if (!NOTION_TOKEN || !NOTION_PAGE_ID) {
  console.error('❌ Missing NOTION_TOKEN or NOTION_PAGE_ID in .env');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

async function main() {
  try {
    // Append a simple paragraph to the page
    const res = await notion.blocks.children.append({
      block_id: NOTION_PAGE_ID,
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: '你好，Notion 👋  |  Hello, Notion!' } }
            ]
          }
        }
      ]
    });

    console.log('✅ Appended a paragraph to the page. Block count:', res.results?.length ?? 0);
  } catch (err) {
    // Friendly diagnostics
    if (err?.status === 401) {
      console.error('❌ 401 Unauthorized: Check NOTION_TOKEN and Integration access.');
    } else if (err?.status === 404) {
      console.error('❌ 404 Not Found: Check NOTION_PAGE_ID and that your Integration can access this page.');
    } else if (err?.status === 400) {
      console.error('❌ 400 Bad Request: Is NOTION_PAGE_ID a Page (not a Database)? Is it the correct ID format?');
    }
    console.error('Details:', err.body || err);
    process.exit(1);
  }
}

main();