import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embedUrl, MOVIES, youtubeId } from '../src/data/movies.ts';

test('the cinema lineup: real-looking ids, and links of every shape are understood', () => {
  assert.ok(MOVIES.length >= 4);
  for (const m of MOVIES) assert.match(m.yt, /^[\w-]{11}$/, m.title);
  const id = 'aqz-KE-bpKQ';
  for (const s of [id, `https://www.youtube.com/watch?v=${id}`, `https://youtu.be/${id}`, `https://m.youtube.com/watch?feature=share&v=${id}`, `https://www.youtube.com/shorts/${id}`, `https://www.youtube.com/embed/${id}`]) assert.equal(youtubeId(s), id, s);
  for (const s of ['', 'hello', 'https://vimeo.com/123', 'javascript:alert(1)']) assert.equal(youtubeId(s), null, s);
  assert.ok(embedUrl(id).startsWith('https://www.youtube-nocookie.com/embed/'));
});
