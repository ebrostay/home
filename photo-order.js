// Pure helpers for reordering a property's photos. Shared by the property
// editor (admin-property.js) and its tests — no DOM or network access here,
// so the ordering logic can be unit-tested in isolation.
(function (global) {
  // Return a new array with the item at fromIndex moved to toIndex. Indices
  // are clamped to the array bounds so callers can pass index +/- 1 freely.
  function moveItem(list, fromIndex, toIndex) {
    const next = list.slice();
    if (fromIndex < 0 || fromIndex >= next.length) return next;
    const bounded = Math.max(0, Math.min(toIndex, next.length - 1));
    const [moved] = next.splice(fromIndex, 1);
    next.splice(bounded, 0, moved);
    return next;
  }

  // Given photos in their desired order, return { id, sort_order } only for the
  // rows whose order actually changed, renumbering to a clean 10, 20, 30… run.
  function renumber(orderedPhotos) {
    const changes = [];
    orderedPhotos.forEach((photo, index) => {
      const sortOrder = (index + 1) * 10;
      if (photo.sort_order !== sortOrder) changes.push({ id: photo.id, sort_order: sortOrder });
    });
    return changes;
  }

  const api = { moveItem, renumber };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.PhotoOrder = api;
})(typeof window !== "undefined" ? window : globalThis);
