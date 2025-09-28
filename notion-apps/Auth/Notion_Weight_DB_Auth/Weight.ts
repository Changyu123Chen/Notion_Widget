import { config } from "dotenv";
import { Client } from "@notionhq/client";
import { put } from '@vercel/blob';
import { toPlain } from "../helper/toPlain";

config();

const notion = new Client({ auth: process.env.NOTION_KEY! })
const databaseId_WEIGHT = process.env.NOTION_DATABASE_WEIGHT!;

type WeightRow = {
    date: string
    morning?: number
    night?: number
    title: string
}

const BLOB_KEY = "weights/latest.json";

async function* readFullWeight(databaseId: string, base: any = {}) {
    let cursor: string | undefined;

    do {
        const resp = await notion.databases.query({
            database_id: databaseId,
            page_size: 100,
            start_cursor: cursor,
            ...base,
        })
        for (const r of resp.results) yield r as any
        cursor = (resp.has_more ? (resp.next_cursor as string) : undefined)
    } while(cursor)
}

//pull full table from notion and write to blob cache
export async function refreshWeights(): Promise<{count: number}> {
    const rows: WeightRow[] = [];
    for await (const page of readFullWeight(databaseId_WEIGHT, {
        sorts: [{ property: 'Measurement Date', direction: 'ascending' }],
    })) {
        const props: any = (page as any).properties;

        const title = toPlain(props?.['Weight']?.title) || '';
        const date  = props?.['Measurement Date']?.date?.start || '';

        const morning = typeof props?.['Morning weight']?.number === 'number'
        ? props['Morning weight'].number
        : undefined;

        const night = typeof props?.['Night Weight']?.number === 'number'
        ? props['Night Weight'].number
        : undefined;

        if (!date && morning === undefined && night === undefined) continue;

        rows.push({ date, morning, night, title });
    }

    // write to Vercel Blob as a public JSON snapshot
    await put(BLOB_KEY, JSON.stringify({
        updatedAt: new Date().toISOString(),
        rows,
    }), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
    });

    return { count: rows.length };
}