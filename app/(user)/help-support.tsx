import React, { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/src/services/auth-context';

const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() || 'support@chefin.app';

const FAQ_CATEGORIES = ['All', 'Ordering', 'Payments', 'Account', 'Cooking'] as const;
type FaqCategory = (typeof FAQ_CATEGORIES)[number];

type FaqItem = {
  id: string;
  category: Exclude<FaqCategory, 'All'>;
  question: string;
  answer: string;
};

const FAQS: FaqItem[] = [
  {
    id: 'availability',
    category: 'Ordering',
    question: 'Why are some meals not available right away?',
    answer:
      'Each cook sets the dates, times and quantity available for a meal. Check the meal page for the earliest available slot before adding it to your cart.',
  },
  {
    id: 'fulfilment',
    category: 'Ordering',
    question: 'Can I choose pickup or delivery?',
    answer:
      'You can choose an available fulfilment option in your cart. Delivery fees and free-delivery thresholds are calculated separately for each cook.',
  },
  {
    id: 'add-card',
    category: 'Payments',
    question: 'How do I add or switch cards?',
    answer:
      'Open Account → Payment Methods and tap “Add another card”. Tap any saved card to make it the default for your next checkout.',
  },
  {
    id: 'payment-demo',
    category: 'Payments',
    question: 'Are real card payments enabled?',
    answer:
      'Not in this build. The demo stores only the card brand, last four digits and expiry on this device. The full number and CVC are discarded, and a payment provider must be connected before real charges can be processed.',
  },
  {
    id: 'profile',
    category: 'Account',
    question: 'How do I update my profile?',
    answer:
      'Open Account → Edit Profile to update your name, contact details and profile photo. Some contact changes may require verification.',
  },
  {
    id: 'verified-cook',
    category: 'Account',
    question: 'What does the verified cook badge mean?',
    answer:
      'It means the cook holds an MOH Food Handler Certificate, an anti-typhoid vaccination record, or both.',
  },
  {
    id: 'become-cook',
    category: 'Cooking',
    question: 'How do I start a home restaurant?',
    answer:
      'Choose “Start a Home Restaurant” in Account. The guided application covers your profile, address, food-safety documents, first dish and payout details.',
  },
];

export default function HelpSupportScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [category, setCategory] = useState<FaqCategory>('All');
  const [expandedFaq, setExpandedFaq] = useState<string | null>(FAQS[0].id);

  const visibleFaqs = category === 'All' ? FAQS : FAQS.filter(faq => faq.category === category);

  const handleEmailSupport = async () => {
    const accountReference = user?.email ?? user?.phone ?? user?.id ?? 'Not signed in';
    const subject = encodeURIComponent('Chefin support request');
    const body = encodeURIComponent(
      `Hi Chefin Support,\n\nPlease describe how we can help:\n\n\nAccount: ${accountReference}`
    );
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert('Email support', `Send your question to ${SUPPORT_EMAIL}.`);
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Email support', `Send your question to ${SUPPORT_EMAIL}.`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="chatbubbles-outline" size={30} color="#2E7D32" />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>CHEFIN SUPPORT</Text>
            <Text style={styles.heroTitle}>How can we help?</Text>
            <Text style={styles.heroText}>
              Find quick answers or open the page you need in a tap.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => router.push('/(user)/payment-methods')}
            accessibilityRole="button"
          >
            <View style={[styles.quickActionIcon, styles.paymentIcon]}>
              <Ionicons name="card-outline" size={22} color="#2E7D32" />
            </View>
            <Text style={styles.quickActionTitle}>Payment methods</Text>
            <Ionicons name="arrow-forward" size={18} color="#6B7280" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => router.push('/(user)/profile-info')}
            accessibilityRole="button"
          >
            <View style={[styles.quickActionIcon, styles.profileIcon]}>
              <Ionicons name="person-outline" size={22} color="#1565C0" />
            </View>
            <Text style={styles.quickActionTitle}>Profile settings</Text>
            <Ionicons name="arrow-forward" size={18} color="#6B7280" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => router.push('/(user)/notifications')}
            accessibilityRole="button"
          >
            <View style={[styles.quickActionIcon, styles.notificationIcon]}>
              <Ionicons name="notifications-outline" size={22} color="#A04B00" />
            </View>
            <Text style={styles.quickActionTitle}>Notifications</Text>
            <Ionicons name="arrow-forward" size={18} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <View style={styles.faqHeadingRow}>
          <View>
            <Text style={styles.sectionTitle}>Frequently asked questions</Text>
            <Text style={styles.sectionSubtitle}>Tap a question to see the answer.</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        >
          {FAQ_CATEGORIES.map(item => {
            const selected = category === item;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                onPress={() => setCategory(item)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.faqList}>
          {visibleFaqs.map(faq => {
            const expanded = expandedFaq === faq.id;
            return (
              <TouchableOpacity
                key={faq.id}
                style={[styles.faqCard, expanded && styles.faqCardExpanded]}
                onPress={() => setExpandedFaq(expanded ? null : faq.id)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
              >
                <View style={styles.faqQuestionRow}>
                  <View style={styles.faqCopy}>
                    <Text style={styles.faqCategory}>{faq.category.toUpperCase()}</Text>
                    <Text style={styles.faqQuestion}>{faq.question}</Text>
                  </View>
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={expanded ? '#2E7D32' : '#757575'}
                  />
                </View>
                {expanded && <Text style={styles.faqAnswer}>{faq.answer}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.contactCard}>
          <View style={styles.contactIcon}>
            <Ionicons name="mail-outline" size={25} color="#FFFFFF" />
          </View>
          <Text style={styles.contactTitle}>Still need help?</Text>
          <Text style={styles.contactText}>
            Tell us what happened and include any useful order or account details.
          </Text>
          <TouchableOpacity
            style={styles.contactButton}
            onPress={handleEmailSupport}
            accessibilityRole="link"
            accessibilityLabel={`Email Chefin support at ${SUPPORT_EMAIL}`}
          >
            <Ionicons name="mail" size={19} color="#2E7D32" />
            <Text style={styles.contactButtonText}>Email support</Text>
          </TouchableOpacity>
          <Text style={styles.contactEmail}>{SUPPORT_EMAIL}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#1F2937',
    fontSize: 19,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 44,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#E8F5E9',
    borderRadius: 20,
    padding: 20,
    marginBottom: 28,
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    flex: 1,
  },
  heroEyebrow: {
    color: '#2E7D32',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  heroTitle: {
    color: '#17351A',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 5,
  },
  heroText: {
    color: '#4B6350',
    fontSize: 13,
    lineHeight: 19,
  },
  sectionTitle: {
    color: '#1F2937',
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 4,
  },
  quickActions: {
    gap: 10,
    marginTop: 14,
    marginBottom: 30,
  },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 15,
    padding: 13,
  },
  quickActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentIcon: {
    backgroundColor: '#E8F5E9',
  },
  profileIcon: {
    backgroundColor: '#E7F1FC',
  },
  notificationIcon: {
    backgroundColor: '#FFF0E3',
  },
  quickActionTitle: {
    flex: 1,
    color: '#30363D',
    fontSize: 15,
    fontWeight: '600',
  },
  faqHeadingRow: {
    marginBottom: 14,
  },
  categoryList: {
    gap: 8,
    paddingRight: 20,
    marginBottom: 15,
  },
  categoryChip: {
    borderWidth: 1,
    borderColor: '#DDDFE1',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  categoryChipSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  categoryText: {
    color: '#5F6368',
    fontSize: 13,
    fontWeight: '600',
  },
  categoryTextSelected: {
    color: '#2E7D32',
  },
  faqList: {
    gap: 10,
  },
  faqCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6E8EA',
    borderRadius: 15,
    padding: 16,
  },
  faqCardExpanded: {
    borderColor: '#A5D6A7',
  },
  faqQuestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  faqCopy: {
    flex: 1,
  },
  faqCategory: {
    color: '#4CAF50',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  faqQuestion: {
    color: '#2D3136',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  faqAnswer: {
    color: '#5F6368',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 13,
    paddingTop: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E7E7E7',
  },
  contactCard: {
    alignItems: 'center',
    backgroundColor: '#214A25',
    borderRadius: 20,
    padding: 22,
    marginTop: 30,
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13,
  },
  contactTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 7,
  },
  contactText: {
    color: '#D5E8D7',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 17,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 13,
  },
  contactButtonText: {
    color: '#2E7D32',
    fontSize: 15,
    fontWeight: '700',
  },
  contactEmail: {
    color: '#BBD4BE',
    fontSize: 11,
    marginTop: 10,
  },
});
