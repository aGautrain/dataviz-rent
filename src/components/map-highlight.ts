/**
 * Shared by the listing cards (server components) and the map (client): a
 * card carrying this attribute highlights the map point with that id while
 * hovered or focused. Kept out of listing-map.tsx because server components
 * can't import plain values from a "use client" module.
 */
export const POINT_ID_ATTRIBUTE = "data-point-id";
