import { Node, mergeAttributes } from '@tiptap/core';
export const NewsletterImage = Node.create({
  name: 'newsletterImage', group: 'block', atom: true, draggable: true,
  addAttributes() { return {
    src: { default: '' }, alt: { default: '' }, width: { default: 500 },
    fileId: { default: '', parseHTML: el => el.getAttribute('data-file-id'), renderHTML: attrs => ({ 'data-file-id': attrs.fileId }) },
  }; },
  parseHTML() { return [{ tag: 'img[data-file-id]' }]; },
  renderHTML({ HTMLAttributes }) { return ['img', mergeAttributes(HTMLAttributes, { class: 'max-w-full h-auto cursor-move' })]; },
});