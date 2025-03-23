https://www.amazon.com/your-orders/orders?timeFilter=year-2022


Array.from(document.querySelectorAll('.yohtmlc-order-id')).map(el => el.innerText)

yields array of strings like:

ORDER # 113-0301967-6247406

invoice url is like:

https://www.amazon.com/gp/css/summary/print.html?orderID=113-0301967-6247406



 '.order-header__header-link-list-item a[href*="print.html"]' yields the invoice links

 

'li.a-last a' yields the "next" page button, with no <a> present on the last page

couple of ideas:

- can we physically move the mouse (with jitter) and click on things?
- need to randomize delays

