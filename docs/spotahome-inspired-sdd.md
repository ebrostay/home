# Ebrostay Marketplace Software Design Document

## Purpose

Ebrostay needs a Zaragoza-focused rental and property-management website inspired by common mid-term rental marketplace patterns. The implementation should remain legally distinct from Spotahome: no copied branding, visual trade dress, text, images, proprietary data, or exact layouts.

Reference observations from Spotahome:

- The homepage emphasizes monthly rental search, trust, support, owner/landlord paths, multilingual navigation, and city search. Source: https://www.spotahome.com/
- The Zaragoza search page presents result count, sorting, listing cards, availability dates, monthly pricing, amenities, verification/protection badges, ratings, and expandable details. Source: https://www.spotahome.com/s/zaragoza

## Product Scope

The first Ebrostay version is a static GitHub Pages site with client-side search and sample data. Future versions may connect to a real property database, calendar feeds, booking workflows, and owner dashboards.

## Primary Users

- Tenants looking for furnished short- or medium-term housing in Zaragoza.
- Property owners looking for management services.
- Ebrostay operators who need to update listings, availability, prices, and property details.

## Core Requirements

### Public Site

- Provide Spanish and English language switching.
- Show Ebrostay branding in header and footer.
- Provide a hero search entry point for city, move-in date, and guests.
- Present property-management value proposition for owners.
- Present tenant-facing listings and availability filters.
- Provide direct contact via email form.
- Work on desktop and mobile without paid hosting.

### Search And Listings

- Filter properties by city, check-in, check-out, guest count, property type, and maximum monthly budget.
- Sort properties by best match, price, and new arrivals.
- Display result count and empty state.
- Display listing cards with:
  - property type
  - neighborhood
  - availability status
  - available-from date
  - monthly price
  - guest capacity
  - rating
  - verification/protection badges
  - amenities
  - favorite toggle
  - expandable details

### Calendar And Availability

- For static MVP, availability is calculated from sample blocked date ranges in `site.js`.
- In a production version, availability should be sourced from synced calendars or a backend property system.
- Date validation must prevent check-out before check-in.
- Filters should update without page reload.

### Owner Lead Capture

- Contact form should collect name, email, property/neighborhood, and message.
- Submission currently opens a `mailto:` draft.
- Future implementation can connect to a CRM, Airtable, Notion, Google Sheets, or a backend API.

## Functional Modules

### Frontend

- `index.html`: page structure, language keys, forms, listing container.
- `styles.css`: responsive layout, cards, filters, buttons, header, footer.
- `site.js`: translations, sample property data, filters, sorting, favorites, expandable details, mailto form.

### Data Model

Each property should include:

- `id`
- `city`
- `type`
- `nameKey`
- `areaKey`
- `copyKey`
- `detailsKey`
- `guests`
- `price`
- `priceNumber`
- `rating`
- `availableFrom`
- `isNew`
- `checked`
- `depositProtected`
- `billsIncluded`
- `amenities`
- `unavailable`

## Non-Functional Requirements

- Static hosting compatible with GitHub Pages.
- No paid services required for MVP.
- Responsive layout down to mobile widths.
- No private credentials in frontend code.
- No dependency on Spotahome systems, APIs, assets, or data.
- Cache-busted static assets when JavaScript or CSS changes.

## Future Requirements

- Real listing image gallery.
- Map view for Zaragoza neighborhoods.
- Saved favorites persisted to user account or local storage.
- Real availability sync through iCal or PMS API.
- Inquiry workflow with calendar dates and selected listing.
- Admin editor for properties.
- SEO pages for neighborhoods and property types.
- Analytics and conversion tracking.

## Open Questions

- Which real Ebrostay properties should be listed first?
- Should pricing be nightly, monthly, or both?
- Should guest inquiries go to `hello@ebrostay.com` or a CRM?
- Does Ebrostay want instant booking, request-to-book, or owner lead generation only?
