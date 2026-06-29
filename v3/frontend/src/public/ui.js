/*
  Small page interactions only:
  - Mobile navigation disclosure
  - Sticky nav background state
  - STEM Career Path dropdown
  - FAQ accordion
*/

// Mobile nav toggle
(function () {
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('primaryNav');
  if (toggle && nav) {
    function setNavOpen(state) {
      nav.setAttribute('data-open', state ? 'true' : 'false');
      toggle.setAttribute('aria-expanded', state ? 'true' : 'false');
    }
    toggle.addEventListener('click', function () {
      var open = nav.getAttribute('data-open') === 'true';
      setNavOpen(!open);
    });
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () { setNavOpen(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setNavOpen(false);
    });
  }
})();
// Adds a compact/frosted header style after the visitor starts scrolling.
(function () {
  var header = document.getElementById('siteHeader');
  if (!header) return;
  function onScroll() {
    if (window.scrollY > 12) {
      header.classList.add('scrolled');
      document.body.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
      document.body.classList.remove('scrolled');
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// Keeps the program dropdown usable by click, hover, outside-click, and Escape.
(function () {
  var dd = document.getElementById('programDropdown');
  if (!dd) return;
  var trigger = dd.querySelector('.dropdown-trigger');
  var menu = dd.querySelector('.dropdown-menu');
  function setOpen(state) {
    dd.setAttribute('data-open', state ? 'true' : 'false');
    trigger.setAttribute('aria-expanded', state ? 'true' : 'false');
    menu.hidden = !state;
  }
  trigger.addEventListener('click', function (e) {
    e.preventDefault();
    var open = dd.getAttribute('data-open') === 'true';
    setOpen(!open);
  });
  // Global close behaviors keep the dropdown from lingering open.
  document.addEventListener('click', function (e) {
    if (!dd.contains(e.target)) setOpen(false);
  });
  // Esc to close
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setOpen(false);
  });
  // Close after a link click so mobile users return to page content immediately.
  dd.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { setOpen(false); });
  });
})();

// FAQ accordion: one question is open at a time to keep the section compact.
(function () {
  var faqWrap = document.getElementById('faqWrap');
  if (!faqWrap) return;
  function setFaqOpen(item, state) {
    var btn = item.querySelector('.faq-q');
    var panel = item.querySelector('.faq-a');
    item.setAttribute('data-open', state ? 'true' : 'false');
    btn.setAttribute('aria-expanded', state ? 'true' : 'false');
    panel.hidden = !state;
  }
  faqWrap.querySelectorAll('.faq-item').forEach(function (item, index) {
    var btn = item.querySelector('.faq-q');
    var panel = item.querySelector('.faq-a');
    panel.id = panel.id || 'faq-answer-' + (index + 1);
    btn.setAttribute('aria-controls', panel.id);
    setFaqOpen(item, false);
    btn.addEventListener('click', function () {
      var open = item.getAttribute('data-open') === 'true';
      faqWrap.querySelectorAll('.faq-item[data-open="true"]').forEach(function (o) {
        if (o !== item) setFaqOpen(o, false);
      });
      setFaqOpen(item, !open);
    });
  });
})();
