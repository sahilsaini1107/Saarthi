import { describe, expect, it } from 'vitest'
import {
  contentStats,
  daysBetweenISO,
  decodeEntities,
  defaultTitleFor,
  extractArticle,
  fileView,
  formatBytes,
  isAcceptedUploadMime,
  isHttpUrl,
  isPrivateHost,
  youtubeEmbedUrl,
  youtubeId,
  youtubeThumbUrl,
  type ContentLike,
} from '@/lib/content'

const item = (over: Partial<ContentLike> = {}): ContentLike => ({
  kind: 'link',
  status: 'inbox',
  favorite: false,
  addedOn: '2026-09-01',
  ...over,
})

describe('youtubeId — URL shapes', () => {
  it('parses the common watch / share / shorts / embed forms', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=30')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('accepts a bare 11-char ID as a passthrough convenience', () => {
    expect(youtubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youtubeId('  dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ')
  })

  it('rejects non-YouTube hosts, bad IDs and garbage', () => {
    expect(youtubeId('https://vimeo.com/123456789')).toBeNull()
    expect(youtubeId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull() // v param only counts on YouTube hosts
    expect(youtubeId('https://www.youtube.com/watch?v=shortid')).toBeNull()
    expect(youtubeId('https://youtu.be/')).toBeNull()
    expect(youtubeId('https://youtu.be/shortid')).toBeNull() // wrong length
    expect(youtubeId('https://youtube.com/watch?notv=dQw4w9WgXcQ')).toBeNull()
    expect(youtubeId('ftp://youtu.be/dQw4w9WgXcQ')).toBeNull()
    expect(youtubeId('not a url')).toBeNull()
    expect(youtubeId('')).toBeNull()
  })
})

describe('youtube helpers', () => {
  it('builds a privacy-enhanced embed and thumb URL', () => {
    expect(youtubeEmbedUrl('dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0')
    expect(youtubeThumbUrl('dQw4w9WgXcQ')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg')
  })

  it('defaultTitleFor is honest when we cannot know the title', () => {
    expect(defaultTitleFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('YouTube video')
    expect(defaultTitleFor('https://blog.acme.dev/some/post')).toBe('blog.acme.dev')
    expect(defaultTitleFor('not a url')).toBe('Untitled')
  })
})

describe('links, hosts and files', () => {
  it('isHttpUrl only admits http(s)', () => {
    expect(isHttpUrl('https://x.dev/a')).toBe(true)
    expect(isHttpUrl('http://x.dev/a')).toBe(true)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('ftp://x.dev')).toBe(false)
    expect(isHttpUrl('hello')).toBe(false)
  })

  it('isPrivateHost blocks loopback, RFC1918, link-local, CGNAT and metadata', () => {
    expect(isPrivateHost('localhost')).toBe(true)
    expect(isPrivateHost('api.localhost')).toBe(true)
    expect(isPrivateHost('myserver.local')).toBe(true)
    expect(isPrivateHost('svc.internal')).toBe(true)
    expect(isPrivateHost('127.0.0.1')).toBe(true)
    expect(isPrivateHost('10.1.2.3')).toBe(true)
    expect(isPrivateHost('172.16.0.1')).toBe(true)
    expect(isPrivateHost('172.31.255.255')).toBe(true)
    expect(isPrivateHost('192.168.1.1')).toBe(true)
    expect(isPrivateHost('169.254.169.254')).toBe(true) // cloud metadata
    expect(isPrivateHost('100.64.0.1')).toBe(true) // CGNAT
    expect(isPrivateHost('0.0.0.0')).toBe(true)
    expect(isPrivateHost('::1')).toBe(true)
    expect(isPrivateHost('fd00::1')).toBe(true)
    expect(isPrivateHost('fe80::1')).toBe(true)
    expect(isPrivateHost('example.com')).toBe(false)
    expect(isPrivateHost('172.32.0.1')).toBe(false) // just outside the range
    expect(isPrivateHost('100.63.0.1')).toBe(false)
  })

  it('fileView routes mimes and the accepted-upload set matches', () => {
    expect(fileView('video/mp4')).toBe('video')
    expect(fileView('AUDIO/WEBM')).toBe('audio')
    expect(fileView('application/pdf')).toBe('pdf')
    expect(fileView('image/jpeg')).toBe('image')
    expect(fileView('application/zip')).toBe('download')
    expect(isAcceptedUploadMime('video/mp4')).toBe(true)
    expect(isAcceptedUploadMime('application/zip')).toBe(false)
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(820 * 1024)).toBe('820 KB')
    expect(formatBytes(1.4 * 1024 * 1024)).toBe('1.4 MB')
  })
})

describe('contentStats — queue math', () => {
  it('counts statuses, favorites and completion with 2-decimal rounding', () => {
    const items: ContentLike[] = [
      item({ status: 'done' }),
      item({ status: 'done' }),
      item({ status: 'done' }),
      item({ status: 'inbox' }),
      item({ status: 'active' }),
      item({ status: 'archived' }),
      item({ favorite: true }),
      item({ favorite: true, status: 'done' }),
    ]
    const s = contentStats(items, '2026-09-07')
    expect(s.total).toBe(8)
    expect(s.inbox).toBe(2)
    expect(s.active).toBe(1)
    expect(s.done).toBe(4)
    expect(s.archived).toBe(1)
    expect(s.favorites).toBe(2)
    const live = 7 // 8 − 1 archived
    expect(s.completionPct).toBe(Math.round((4 / live) * 100 * 100) / 100)
  })

  it('completion rounding keeps 2 decimals (1/3 = 33.33)', () => {
    const s = contentStats([item({ status: 'done' }), item(), item()], '2026-09-07')
    expect(s.completionPct).toBe(33.33)
  })

  it('completionPct is null when nothing is live yet', () => {
    expect(contentStats([item({ status: 'archived' })], '2026-09-07').completionPct).toBeNull()
    expect(contentStats([], '2026-09-07').completionPct).toBeNull()
  })

  it('addedThisWeek is the trailing 7-day window ending today, inclusive', () => {
    const items: ContentLike[] = [
      item({ addedOn: '2026-09-07' }), // today
      item({ addedOn: '2026-09-01' }), // exactly 6 days back — inside
      item({ addedOn: '2026-08-31' }), // 7 days back — outside
    ]
    const s = contentStats(items, '2026-09-07')
    expect(s.addedThisWeek).toBe(2)
  })

  it('oldestUnconsumedDays ignores done and archived items', () => {
    const items: ContentLike[] = [
      item({ addedOn: '2026-01-01', status: 'done' }),
      item({ addedOn: '2026-05-05', status: 'archived' }),
      item({ addedOn: '2026-09-05' }),
      item({ addedOn: '2026-09-06', status: 'active' }),
    ]
    const s = contentStats(items, '2026-09-07')
    expect(s.oldestUnconsumedDays).toBe(2)
    expect(contentStats([item({ addedOn: '2026-01-01', status: 'done' })], '2026-09-07').oldestUnconsumedDays).toBeNull()
  })

  it('handles year rollover and leap days in ages', () => {
    expect(daysBetweenISO('2025-12-31', '2026-01-01')).toBe(1)
    expect(daysBetweenISO('2024-02-28', '2024-02-29')).toBe(1) // leap
    expect(daysBetweenISO('2023-02-28', '2023-03-01')).toBe(1) // non-leap
    const s = contentStats([item({ addedOn: '2024-02-29' })], '2024-03-05')
    expect(s.oldestUnconsumedDays).toBe(5)
  })
})

describe('decodeEntities', () => {
  it('decodes named and numeric entities, leaves unknown names intact', () => {
    expect(decodeEntities('A &amp; B &lt;tag&gt; &quot;q&quot; &#39;x&#39;')).toBe('A & B <tag> "q" \'x\'')
    expect(decodeEntities('na&#239;ve &#x2014; dash &nbsp; sp')).toBe('naïve — dash   sp')
    expect(decodeEntities('&unknownent; &nosuch;')).toBe('&unknownent; &nosuch;')
    expect(decodeEntities('&#xZZ; &#999999999999;')).toBe('&#xZZ; ') // malformed left intact, out-of-range numeric dropped
  })
})

describe('extractArticle — readability-lite', () => {
  it('strips scripts, styles and chrome, keeps paragraphs and headings', () => {
    const html = `<html><head><title>My &amp; Article</title></head><body>
      <nav>skip me</nav><script>evil()</script><style>.x{}</style>
      <article>
        <h1>Heading one</h1>
        <p>First   paragraph with &quot;quotes&quot; and &#39;apos&#39;.</p>
        <p>Second paragraph</p>
        <ul><li>item A</li><li>item B</li></ul>
        <footer>skip footer</footer>
      </article></body></html>`
    const out = extractArticle(html)
    expect(out.title).toBe('My & Article')
    expect(out.text).toContain('Heading one')
    expect(out.text).toContain('First paragraph with "quotes" and \'apos\'.')
    expect(out.text).toContain('item A')
    expect(out.text).toContain('item B')
    expect(out.text).not.toContain('skip me')
    expect(out.text).not.toContain('evil()')
    expect(out.text).not.toContain('skip footer')
    expect(out.text).not.toContain('<')
  })

  it('prefers the longest <article> block when several exist', () => {
    const html = `<body><article><p>short</p></article>
      <article><p>${'long content '.repeat(20)}</p></article></body>`
    const out = extractArticle(html)
    expect(out.text).toContain('long content')
    expect(out.text).not.toContain('short')
  })

  it('falls back to the body when no <article> exists and extracts the title', () => {
    const html = '<html><head><title>Page</title></head><body><div><p>alpha</p><p>beta</p></div></body></html>'
    const out = extractArticle(html)
    expect(out.title).toBe('Page')
    expect(out.text).toContain('alpha')
    expect(out.text).toContain('beta')
  })

  it('handles html comments and collapses whitespace per line', () => {
    const html = '<body><!-- hidden comment --><p>   spaced\t  out   </p></body>'
    const out = extractArticle(html)
    expect(out.text).toBe('spaced out')
    expect(out.text).not.toContain('hidden comment')
  })

  it('returns null title when absent and caps runaway text', () => {
    expect(extractArticle('<body><p>plain text only</p></body>').title).toBeNull()
    const big = extractArticle(`<body><p>${'x'.repeat(200_000)}</p></body>`)
    expect(big.text.length).toBeLessThanOrEqual(80_000)
  })
})
