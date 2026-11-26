// The root loader only shows when the first part of the address changes. Moving between admin
// pages (dashboard ↔ edit issue) keeps `/admin`, so the admin section needs its own boundary.
export { default } from '../loading'
