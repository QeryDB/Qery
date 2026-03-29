import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/**
 * Qery dark theme for CodeMirror.
 * True-black background with teal keyword accents matching branding preview.
 */
const qeryDarkColors = EditorView.theme(
  {
    '&': {
      backgroundColor: '#0E0E0F',
      color: '#D4D4D4',
    },
    '.cm-content': {
      caretColor: '#6EC9A5',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#6EC9A5',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: 'rgba(110, 201, 165, 0.15)',
      },
    '.cm-activeLine': {
      backgroundColor: 'rgba(110, 201, 165, 0.04)',
    },
    '.cm-gutters': {
      backgroundColor: '#111112',
      color: '#555',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(110, 201, 165, 0.08)',
      color: '#999',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 8px 0 16px',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(110, 201, 165, 0.2)',
      outline: '1px solid rgba(110, 201, 165, 0.4)',
    },
    '.cm-tooltip': {
      backgroundColor: '#1A1A1B',
      border: '1px solid #2A2A2B',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: 'rgba(110, 201, 165, 0.12)',
        color: '#D4D4D4',
      },
    },
  },
  { dark: true }
);

const qeryDarkHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#6EC9A5', fontWeight: '600' },
  { tag: tags.operatorKeyword, color: '#6EC9A5', fontWeight: '600' },
  { tag: tags.controlKeyword, color: '#6EC9A5', fontWeight: '600' },
  { tag: tags.definitionKeyword, color: '#6EC9A5', fontWeight: '600' },
  { tag: tags.moduleKeyword, color: '#6EC9A5', fontWeight: '600' },
  { tag: tags.function(tags.variableName), color: '#F97316' },
  { tag: tags.string, color: '#4ADE80' },
  { tag: tags.number, color: '#60A5FA' },
  { tag: tags.comment, color: '#6B7280', fontStyle: 'italic' },
  { tag: tags.operator, color: '#9CA3AF' },
  { tag: tags.punctuation, color: '#6B7280' },
  { tag: tags.typeName, color: '#C084FC' },
  { tag: tags.bool, color: '#60A5FA' },
  { tag: tags.null, color: '#6B7280' },
  { tag: tags.variableName, color: '#D4D4D4' },
  { tag: tags.propertyName, color: '#D4D4D4' },
]);

export const qeryDarkTheme = [
  qeryDarkColors,
  syntaxHighlighting(qeryDarkHighlight),
];
