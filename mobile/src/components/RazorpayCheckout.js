// Opens Razorpay's hosted Standard Checkout inside a WebView (checkout.js), instead of the
// native react-native-razorpay SDK - this keeps the app working in plain Expo Go with no custom
// dev-client build. The backend already created the order (see api.js: createPaymentOrder); this
// component only drives the checkout UI and reports back what the user did.
import { Modal, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

// escape "</" so a prefilled string can never prematurely close the inline <script> tag
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const buildHtml = (order) => {
  const options = {
    key: order.keyId,
    amount: Math.round(order.amount * 100),
    currency: order.currency,
    order_id: order.orderId,
    name: 'CareNest',
    description: 'Appointment payment',
    prefill: { name: order.name, email: order.email, contact: order.contact },
    theme: { color: '#059669' },
  };
  return `<!doctype html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  </head><body style="margin:0;background:#fff">
  <script>
    function post(msg) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
    var options = Object.assign(${safeJson(options)}, {
      handler: function (response) {
        post({ type: 'success', paymentId: response.razorpay_payment_id, orderId: response.razorpay_order_id, signature: response.razorpay_signature });
      },
      modal: { ondismiss: function () { post({ type: 'cancel' }); } }
    });
    try {
      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function (response) {
        post({ type: 'failed', description: response.error && response.error.description });
      });
      rzp.open();
    } catch (e) {
      post({ type: 'failed', description: String(e) });
    }
  </script>
  </body></html>`;
};

// order = the createPaymentOrder() response. onMessage receives { type: 'success'|'cancel'|'failed', ... }.
export default function RazorpayCheckout({ visible, order, onMessage }) {
  if (!order) return null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => onMessage({ type: 'cancel' })}>
      <SafeAreaView style={styles.root}>
        <View style={styles.webviewWrap}>
          <WebView
            source={{ html: buildHtml(order) }}
            originWhitelist={['*']}
            onMessage={(e) => {
              try {
                onMessage(JSON.parse(e.nativeEvent.data));
              } catch {
                onMessage({ type: 'failed', description: 'Could not read payment result' });
              }
            }}
            startInLoadingState
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  webviewWrap: { flex: 1 },
});
