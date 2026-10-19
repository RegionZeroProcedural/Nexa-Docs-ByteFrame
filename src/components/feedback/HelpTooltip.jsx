import { useEffect } from 'react';

/** Single accessible visual tooltip layer for both toolbar and portalled menus.
 * Browser-native `title` bubbles cannot be restyled; translate those titles to
 * data attributes while the editor is mounted. No layout or editor state changes. */
export default function HelpTooltip() {
  useEffect(() => {
    const tooltip = document.createElement('div');
    tooltip.className = 'nexa-help-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tooltip);
    const own = element => Boolean(element?.closest?.('.nexa-shell, .submenu-panel'));
    const transformTitle = root => {
      const set = el => {
        if (!own(el) || !el.hasAttribute('title')) return;
        const label = el.getAttribute('title');
        if (label) el.setAttribute('data-nexa-tip', label);
        el.removeAttribute('title');
      };
      if (root?.nodeType !== 1) return;
      set(root);
      root.querySelectorAll?.('[title]').forEach(set);
    };
    transformTitle(document.body);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes') transformTitle(record.target);
        else for (const node of record.addedNodes) transformTitle(node);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
    let current = null;
    let timer = null;
    const hide = () => { clearTimeout(timer); timer = null; current = null; tooltip.classList.remove('is-visible'); };
    const show = (el, immediate = false) => {
      if (!el || !own(el)) { hide(); return; }
      const text = el.getAttribute('data-nexa-tip');
      if (!text) { hide(); return; }
      if (current === el && tooltip.classList.contains('is-visible')) return;
      clearTimeout(timer);
      tooltip.classList.remove('is-visible');
      current = el;
      timer = setTimeout(() => {
        if (current !== el || !el.isConnected) return;
        tooltip.textContent = text;
        const rect = el.getBoundingClientRect();
        tooltip.classList.add('is-visible');
        const measured = tooltip.getBoundingClientRect();
        const x = Math.min(window.innerWidth - measured.width / 2 - 8,
          Math.max(measured.width / 2 + 8, rect.left + rect.width / 2));
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${rect.top >= measured.height + 14 ? rect.top - measured.height - 9 : rect.bottom + 9}px`;
      }, immediate ? 10 : 480);
    };
    const pointerOver = e => {
      const target = e.target?.closest?.('[data-nexa-tip]');
      if (target !== current) show(target);
    };
    const pointerOut = e => {
      if (current && !current.contains(e.relatedTarget)) hide();
    };
    const focusIn = e => show(e.target?.closest?.('[data-nexa-tip]'), true);
    const focusOut = e => { if (current && !current.contains(e.relatedTarget)) hide(); };
    const escape = e => { if (e.key === 'Escape') hide(); };
    document.addEventListener('pointerover', pointerOver, true);
    document.addEventListener('pointerout', pointerOut, true);
    document.addEventListener('focusin', focusIn, true);
    document.addEventListener('focusout', focusOut, true);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', hide);
    return () => {
      hide(); observer.disconnect(); tooltip.remove();
      document.removeEventListener('pointerover', pointerOver, true);
      document.removeEventListener('pointerout', pointerOut, true);
      document.removeEventListener('focusin', focusIn, true);
      document.removeEventListener('focusout', focusOut, true);
      document.removeEventListener('scroll', hide, true);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', hide);
    };
  }, []);
  return null;
}
