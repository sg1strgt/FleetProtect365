(() => {
  'use strict';

  const employeesButton = document.querySelector('[data-view="drivers"]');
  const pageTitle = document.getElementById('title');

  if (!employeesButton || !pageTitle) return;

  employeesButton.addEventListener('click', () => {
    setTimeout(() => {
      pageTitle.textContent = 'Employees';
    }, 0);
  });
})();
