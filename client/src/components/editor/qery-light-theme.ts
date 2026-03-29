import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

/**
 * Qery light theme for CodeMirror.
 * Matches branding preview: teal keywords, orange functions, light bg.
 */
const qeryLightColors = EditorView.theme(
  {
    '&': {
      backgroundColor: '#FAFBFC',
      color: '#1E1E1E',
    },
    '.cm-content': {
      caretColor: '#2D7D5F',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#2D7D5F',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: 'rgba(45, 125, 95, 0.12)',
      },
    '.cm-activeLine': {
      backgroundColor: 'rgba(45, 125, 95, 0.04)',
    },
    '.cm-gutters': {
      backgroundColor: '#F3F4F6',
      color: '#9CA3AF',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(45, 125, 95, 0.08)',
      color: '#374151',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 8px 0 16px',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(45, 125, 95, 0.15)',
      outline: '1px solid rgba(45, 125, 95, 0.3)',
    },
    '.cm-tooltip': {
      backgroundColor: '#FFFFFF',
      border: '1px solid #E5E7EB',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: 'rgba(45, 125, 95, 0.1)',
        color: '#1E1E1E',
      },
    },
  },
  { dark: false }
);

const qeryLightHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#2D7D5F', fontWeight: '600' },
  { tag: tags.operatorKeyword, color: '#2D7D5F', fontWeight: '600' },
  { tag: tags.controlKeyword, color: '#2D7D5F', fontWeight: '600' },
  { tag: tags.definitionKeyword, color: '#2D7D5F', fontWeight: '600' },
  { tag: tags.moduleKeyword, color: '#2D7D5F', fontWeight: '600' },
  { tag: tags.function(tags.variableName), color: '#F97316' },
  { tag: tags.string, color: '#16A249' },
  { tag: tags.number, color: '#3B82F6' },
  { tag: tags.comment, color: '#9CA3AF', fontStyle: 'italic' },
  { tag: tags.operator, color: '#374151' },
  { tag: tags.punctuation, color: '#6B7280' },
  { tag: tags.typeName, color: '#A855F7' },
  { tag: tags.bool, color: '#3B82F6' },
  { tag: tags.null, color: '#9CA3AF' },
  { tag: tags.variableName, color: '#1E1E1E' },
  { tag: tags.propertyName, color: '#1E1E1E' },
]);

export const qeryLightTheme = [
  qeryLightColors,
  syntaxHighlighting(qeryLightHighlight),
];
