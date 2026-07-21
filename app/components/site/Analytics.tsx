// Umami Cloud analytics — cookieless, no personal data (privacy page relies
// on this). Same site + website-id as v1 (main:index.html); rendered as a
// plain deferred script tag, exactly as v1 shipped it.
//
// Server component; not yet mounted — the layout task wires it into
// app/[locale]/layout.tsx (<Analytics /> in <head> or at the end of <body>).
export function Analytics() {
  return (
    <script
      defer
      src="https://cloud.umami.is/script.js"
      data-website-id="bbc35688-d574-4fed-af9b-a03f37ed9429"
    />
  );
}
