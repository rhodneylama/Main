# UGC creator portfolio

A single self-contained page (`index.html`) that demos your work as a UGC
creator. No build step, no dependencies, no framework — one file you can open
by double-clicking or drop on any host.

## What's on it

Sticky nav · hero with stats · brand marquee · filterable vertical-video
portfolio with a lightbox · three pricing packages · four-step process ·
about · testimonials · contact section with an enquiry form · footer.

## Make it yours

Everything you need to change is listed in a comment at the top of
`index.html`. The short version:

| What | How |
| --- | --- |
| Name | Replace `Creator Name` (and the `CN` initials in the nav) |
| Location | Replace `[CITY]` |
| Email | Replace `hello@yourdomain.com` (two places: the link and the form script) |
| Socials | The `data-social` links in the contact section |
| Prices | Replace `$XXX` |
| Brands | Edit the `.marquee` list |
| Colours | The `--brand` / `--paper` / `--night` tokens at the top of the stylesheet |

### Adding your videos

Make an `assets/` folder next to `index.html`, drop your clips in, then on each
work card set:

```html
<button class="card" data-cat="beauty" data-title="Lumen Skin" data-sub="Hook test"
        data-video="assets/reel-1.mp4" data-poster="assets/reel-1.jpg">
```

Cards without a `data-video` show a styled gradient placeholder, so the page
looks finished before you've uploaded anything. To show the clip inline on the
card too (not just in the lightbox), replace the `<span class="ph">…</span>`
inside `.card__media` with a `<video src="…" muted loop playsinline>`.

Same for the portrait in the About section — swap the placeholder `<div>` for
`<img src="assets/portrait.jpg" alt="…">`.

### The enquiry form

It builds a `mailto:` link, so it works with no backend. For submissions in an
inbox instead, point the `<form>` at Formspree, Tally or Netlify Forms and
delete the submit handler at the bottom of the script.

## Publishing

Any static host works — drag the folder onto Netlify or Cloudflare Pages, or
push it to GitHub Pages. Nothing needs to be compiled.

Before you go live, replace `assets/og.jpg` (the social preview image) or
remove that `<meta property="og:image">` line.
