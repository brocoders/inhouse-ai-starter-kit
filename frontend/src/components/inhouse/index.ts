// The vocabulary screens compose from, one line each. Read this before writing
// a component: if the thing exists here, use it; if it nearly exists, give it a
// prop rather than writing a second one beside it.
export { PageHeader } from './page-header'; // title, one line, actions — every screen opens with it
export { EmptyState } from './empty-state'; // nothing to show, and the one thing to do about it
export { PagedList } from './paged-list'; // a long list: only visible rows in the document, next page on approach
export { FilterBar, Field } from './filter-bar'; // a row of labelled controls above a list
export { Choice, type ChoiceOption } from './choice'; // one value from a short list; replaces a raw Select
export {
  PeriodPicker,
  periodPresets,
  presetPeriod,
  previousPeriod,
  type Period,
} from './period-picker'; // a stretch of calendar days, in the app's own time zone
export { KpiCard } from './kpi-card'; // one figure, loud, linking to the records behind it
export { BarList, type BarListRow } from './bar-list'; // ranked horizontal bars; the phone-friendly breakdown
export { CategoryBar, type Segment } from './category-bar'; // one bar split into shares, legend with percentages
export { Amount } from './amount'; // a whole number of the smallest unit, written the way its unit is
export { StatusBadge, type StatusTone } from './status-badge'; // a state, in a word and a colour that means something
export { HistoryList } from './history-list'; // an audit trail as sentences: who changed what, when
export { RefreshButton } from './refresh-button'; // re-read everything; desktop only, the phone pulls down
export { FormField } from './form-field'; // label, control, and the sentence saying what is wrong
export { ConfirmDialog } from './confirm-dialog'; // the one pause before something that cannot be undone
