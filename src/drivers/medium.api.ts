import { env } from '../infra/config.js';

const BASE = 'https://api.medium.com/v1';

async function request(path: string, init: RequestInit = {}) {
  if (!env.MEDIUM_TOKEN) throw new Error('MEDIUM_TOKEN not configured');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${env.MEDIUM_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Medium API ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

export async function getMe(): Promise<{ data: { id: string; username: string } }> {
  return request('/me');
}

export type CreatePostParams = {
  userId: string;
  title: string;
  content: string;               // HTML for now
  tags?: string[];               // Medium limits to 5
  canonicalUrl?: string;
  publishStatus?: 'public' | 'draft' | 'unlisted';
  notifyFollowers?: boolean;     // default false
};

export async function createPost(params: CreatePostParams) {
  const { userId, title, content, tags = [], canonicalUrl, publishStatus = 'draft', notifyFollowers = false } = params;
  const body = {
    title,
    contentFormat: 'html',
    content,
    tags: tags.slice(0, 5),
    canonicalUrl,
    publishStatus,
    notifyFollowers,
  };
  return request(`/users/${userId}/posts`, { method: 'POST', body: JSON.stringify(body) });
}
