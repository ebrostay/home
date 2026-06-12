# Ebrostay Website

Static website for `ebrostay.com`, designed for free hosting on GitHub Pages.

## Edit With ChatGPT

After this folder is published as a GitHub repository, connect GitHub to ChatGPT and authorize the repository. Then ask ChatGPT to edit:

- `index.html` for page copy and structure
- `styles.css` for visual design
- `site.js` for the simple inquiry form
- `assets/` for images and icons

## Deploy On GitHub Pages

1. Create a GitHub repository, for example `ebrostay-site`.
2. Upload or push these files.
3. In GitHub, open Settings -> Pages.
4. Set Source to `Deploy from a branch`.
5. Select the main branch and root folder.
6. Save, then wait for GitHub Pages to publish the site.

## GoDaddy DNS For GitHub Pages

When GitHub Pages is ready, replace the current GoDaddy Website Builder record with GitHub Pages records:

```text
A     @      185.199.108.153
A     @      185.199.109.153
A     @      185.199.110.153
A     @      185.199.111.153
CNAME www    <your-github-username>.github.io
```

Keep existing mail, DMARC, and nameserver records unless you intentionally change email providers.
