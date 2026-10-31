(() => {
 const key = date => date.toISOString().slice(0,10);
 const date = value => new Date(`${value}T12:00:00Z`);
 const shift = (value,days) => {const d=date(value);d.setUTCDate(d.getUTCDate()+days);return key(d);};
 const monthCells = (year,month) => {const first=new Date(Date.UTC(year,month,1,12));const start=shift(key(first),-first.getUTCDay());return Array.from({length:42},(_,i)=>shift(start,i));};
 const supported = value => /^202[67]-\d{2}-\d{2}$/.test(value) && value>='2026-01-01' && value<='2027-12-31';
 globalThis.FP365_CALENDAR_DATES={key,date,shift,monthCells,supported};
})();
