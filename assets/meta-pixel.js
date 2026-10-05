/* Meta Pixel
   This is the only place the Pixel ID is set.
   Replace REPLACE_ME with the ID from Meta Events Manager.
   While it is still REPLACE_ME, this file does nothing and sends no requests.
*/
var META_PIXEL_ID = 'REPLACE_ME';

(function () {
  if (!META_PIXEL_ID || META_PIXEL_ID === 'REPLACE_ME') return;

  /* Standard Meta Pixel base code */
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');

  fbq('init', META_PIXEL_ID);
  fbq('track', 'PageView');

  /* Buy buttons are the Stripe checkout links. */
  document.addEventListener('click', function (event) {
    var node = event.target && event.target.closest ? event.target.closest('a') : null;
    if (!node || !node.href || node.href.indexOf('buy.stripe.com') === -1) return;
    fbq('track', 'InitiateCheckout', { value: 97, currency: 'AUD' });
  }, true);
})();
