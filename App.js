import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Text, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { useState, useRef } from 'react';

const APP_URL = 'https://amadeusdoceus.github.io/TrippinClaude';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const webviewRef = useRef(null);

  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor="#14213D" />
      {loading && (
        <View style={styles.splash}>
          <Text style={styles.splashText}>✈️ Trippin</Text>
          <ActivityIndicator size="large" color="#FF6B5C" style={{ marginTop: 24 }} />
        </View>
      )}
      {error ? (
        <View style={styles.splash}>
          <Text style={styles.splashText}>✈️ Trippin</Text>
          <Text style={styles.errorText}>Sem conexão com a internet.</Text>
          <Text style={styles.errorSub}>Verifique sua conexão e tente novamente.</Text>
        </View>
      ) : (
        <WebView
          ref={webviewRef}
          source={{ uri: APP_URL }}
          style={[styles.webview, loading && styles.hidden]}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
          onHttpError={() => { setLoading(false); setError(true); }}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          geolocationEnabled
          allowsBackForwardNavigationGestures={Platform.OS === 'ios'}
          userAgent="TrippinApp/1.0 (Mobile)"
          onShouldStartLoadWithRequest={(request) => {
            // Manter navegação interna; abrir links externos no browser
            return request.url.startsWith(APP_URL) || request.url.startsWith('mailto:');
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#14213D',
  },
  webview: {
    flex: 1,
  },
  hidden: {
    opacity: 0,
    height: 0,
  },
  splash: {
    flex: 1,
    backgroundColor: '#14213D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashText: {
    color: '#FF6B5C',
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 24,
    fontWeight: '600',
  },
  errorSub: {
    color: '#6B7A90',
    fontSize: 13,
    marginTop: 8,
  },
});
