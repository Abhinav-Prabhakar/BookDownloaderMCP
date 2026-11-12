import { JSDOM } from "jsdom";
import type { HttpClient } from "../core/http";

export function parseDocument(html: string): Document {
  return new JSDOM(html).window.document;
}

export async function fetchDocument(http: HttpClient, url: string): Promise<Document> {
  const html = await http.getText(url);
  return parseDocument(html);
}

export function clearText(text: string): string {
  return (text.split("\n")[0] ?? "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
