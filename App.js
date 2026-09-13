import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  Modal, 
  TextInput, 
  ActivityIndicator, 
  RefreshControl,
  StatusBar
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_TOKEN = 'c4486ffaabdefe0c538a83eb5edd899bc5fba6c5bf7071526e051a2c5a48b___209633';
const DEV_PASSWORD = 'OA3Byy1230';
const STUDENT_ID = '1781';
const DEV_KEY = '6566345ff2850c724676decefe5c2117';
const VENDOR = 'lpsk1733844979';

// Material Design 3 — Dark Minimalist Grey Theme (Reference: Serpantinum)
const m3 = {
  surface: '#111314',
  surfaceContainerLow: '#171a1b',
  surfaceContainer: '#1e2223',
  surfaceContainerHigh: '#262b2c',
  surfaceContainerHighest: '#2f3536',
  outline: '#535b5c',
  outlineVariant: '#343a3b',
  onSurface: '#e2e5e5',
  onSurfaceVariant: '#97a1a1',
  primary: '#76e1c4', // M3 Mint / Sage accent from Serpantinum
  onPrimary: '#00382d',
  primaryContainer: '#0d4f40',
  onPrimaryContainer: '#93fae0',
  warning: '#f6b86f',
  warningContainer: '#352516',
  onWarningContainer: '#ffdcbb',
  error: '#ffb4ab',
  errorContainer: '#491b17',
  onErrorContainer: '#ffdad6',
};

export default function App() {
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [weekInfo, setWeekInfo] = useState('');
  
  // Offline & Archive state
  const [isOffline, setIsOffline] = useState(false);
  const [archiveInfo, setArchiveInfo] = useState('');
  const [archiveSavedTime, setArchiveSavedTime] = useState('');

  // Dev Menu State
  const [devModalVisible, setDevModalVisible] = useState(false);
  const [devStep, setDevStep] = useState(1); // 1: password, 2: token
  const [password, setPassword] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [devError, setDevError] = useState('');
  
  const clickCount = useRef(0);
  const clickTimer = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (isPullToRefresh = false) => {
    if (!isPullToRefresh) {
      setLoading(true);
    }
    setError(null);
    try {
      let storedToken = await AsyncStorage.getItem('school_auth_token');
      if (!storedToken) {
        storedToken = DEFAULT_TOKEN;
      }
      
      const { dateStr, infoStr } = getQueryDates();

      const url = `https://edu.schools48.ru/apiv3/getdiary?student=${STUDENT_ID}&days=${dateStr}&rings=true&devkey=${DEV_KEY}&out_format=json&auth_token=${storedToken}&vendor=${VENDOR}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Сетевая ошибка: ' + response.status);
      }
      
      const data = await response.json();
      const days = data?.response?.result?.students?.[STUDENT_ID]?.days || {};
      
      if (Object.keys(days).length === 0) {
        throw new Error('Расписание не найдено на сервере');
      }

      setSchedule(days);
      setWeekInfo(infoStr);
      setIsOffline(false);

      // Сохраняем единственную копию в AsyncStorage
      const now = new Date();
      const pad = (n) => n.toString().padStart(2, '0');
      const timeStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)} в ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      const dateRangeLabel = infoStr.replace(/^(Расписание:\s*|Следующая неделя:\s*|Летний режим\s*\(архив за\s*)/i, '').replace(/\)$/, '');

      const cachePayload = {
        days,
        infoStr,
        dateRange: dateRangeLabel,
        savedTime: timeStr,
      };

      await AsyncStorage.setItem('cached_schedule', JSON.stringify(cachePayload));
    } catch (err) {
      console.log('Сетевой запрос не удался, проверяем локальный архив:', err.message);
      
      try {
        const cachedRaw = await AsyncStorage.getItem('cached_schedule');
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached && cached.days && Object.keys(cached.days).length > 0) {
            setSchedule(cached.days);
            setIsOffline(true);
            const dateLabel = cached.dateRange || cached.infoStr || 'прошлую неделю';
            setArchiveInfo(dateLabel);
            setArchiveSavedTime(cached.savedTime || '');
            setWeekInfo(`Архив за ${dateLabel}`);
            setError(null);
            return;
          }
        }
      } catch (cacheErr) {
        console.error('Ошибка чтения архива:', cacheErr);
      }

      // Понятное объяснение ошибки
      let friendlyError = err.message || 'Ошибка загрузки данных';
      const msgLower = (err.message || '').toLowerCase();
      if (msgLower.includes('unknownhostexception') || msgLower.includes('failed to fetch') || msgLower.includes('network request failed')) {
        friendlyError = 'Не удалось связаться с сервером edu.schools48.ru.\n\nПроверьте подключение к интернету или отключите VPN / частный DNS в настройках телефона.';
      } else if (msgLower.includes('certpathvalidatorexception') || msgLower.includes('sslhandshakeexception') || msgLower.includes('trust anchor')) {
        friendlyError = 'Ошибка проверки сертификата безопасности сервера.\nВ обновленной версии сертификат уже встроен в приложение.';
      }
      setError(friendlyError);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
  };

  const getQueryDates = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const formatDate = (d) => {
      let month = '' + (d.getMonth() + 1);
      let day = '' + d.getDate();
      const year = d.getFullYear();
      if (month.length < 2) month = '0' + month;
      if (day.length < 2) day = '0' + day;
      return [year, month, day].join('');
    };

    if (currentMonth >= 5 && currentMonth <= 7) {
      const start = new Date(currentYear, 4, 18);
      const end = new Date(currentYear, 4, 22);
      return {
        dateStr: `${formatDate(start)}-${formatDate(end)}`,
        infoStr: `Летний режим (архив за ${start.getDate()}.${start.getMonth()+1}-${end.getDate()}.${end.getMonth()+1})`
      };
    }

    const dayOfWeek = now.getDay(); // 0 = Воскресенье, 1 = Понедельник, ..., 5 = Пятница, 6 = Суббота
    let targetMonday = new Date(now);
    let isNextWeek = false;

    // В пятницу, субботу и воскресенье учителя выставляют дз уже на следующую неделю
    if (dayOfWeek === 5) {
      // Пятница -> следующая неделя (+3 дня до ПН)
      targetMonday.setDate(now.getDate() + 3);
      isNextWeek = true;
    } else if (dayOfWeek === 6) {
      // Суббота -> следующая неделя (+2 дня до ПН)
      targetMonday.setDate(now.getDate() + 2);
      isNextWeek = true;
    } else if (dayOfWeek === 0) {
      // Воскресенье -> следующая неделя (+1 день до ПН)
      targetMonday.setDate(now.getDate() + 1);
      isNextWeek = true;
    } else {
      // Понедельник (1), Вторник (2), Среда (3), Четверг (4) -> текущая неделя
      const distanceToMonday = dayOfWeek - 1;
      targetMonday.setDate(now.getDate() - distanceToMonday);
    }

    const targetFriday = new Date(targetMonday);
    targetFriday.setDate(targetMonday.getDate() + 4);

    const prefix = isNextWeek ? 'Следующая неделя' : 'Расписание';
    return {
      dateStr: `${formatDate(targetMonday)}-${formatDate(targetFriday)}`,
      infoStr: `${prefix}: ${targetMonday.getDate()}.${targetMonday.getMonth()+1} - ${targetFriday.getDate()}.${targetFriday.getMonth()+1}`
    };
  };

  const handleHiddenTrigger = () => {
    clickCount.current += 1;
    if (clickCount.current === 3) {
      openDevMenu();
      clickCount.current = 0;
    }
    
    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      clickCount.current = 0;
    }, 1000);
  };

  const openDevMenu = async () => {
    setDevStep(1);
    setPassword('');
    setDevError('');
    setDevModalVisible(true);
  };

  const handleDevLogin = async () => {
    if (password === DEV_PASSWORD) {
      let storedToken = await AsyncStorage.getItem('school_auth_token');
      setTokenInput(storedToken || DEFAULT_TOKEN);
      setDevStep(2);
      setDevError('');
    } else {
      setDevError('Неверный пароль');
    }
  };

  const handleDevSaveToken = async () => {
    if (tokenInput.trim()) {
      await AsyncStorage.setItem('school_auth_token', tokenInput.trim());
      setDevModalVisible(false);
      loadData();
    }
  };

  const renderSchedule = () => {
    if (loading && !refreshing) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={m3.primary} />
          <Text style={styles.loadingText}>Синхронизация с дневником...</Text>
        </View>
      );
    }

    if (error && !schedule) {
      return (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Нет связи с сервером</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <TouchableOpacity style={styles.primaryPillBtn} onPress={() => loadData(false)}>
            <Text style={styles.primaryPillBtnText}>Повторить попытку</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const dates = Object.keys(schedule || {}).sort();
    
    if (dates.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Расписание на эти дни пусто</Text>
          <TouchableOpacity style={styles.tonalPillBtn} onPress={() => loadData(false)}>
            <Text style={styles.tonalPillBtnText}>Обновить</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return dates.map((dateKey) => {
      const dayData = schedule[dateKey];
      const items = dayData.items || {};
      const lessonNums = Object.keys(items).sort((a,b) => parseInt(a) - parseInt(b));

      return (
        <View key={dateKey} style={styles.dayCard}>
          {/* Day Header with Pill Tag */}
          <View style={styles.dayHeaderRow}>
            <Text style={styles.dayTitle}>{dayData.title}</Text>
            <View style={styles.dayBadge}>
              <Text style={styles.dayBadgeText}>{lessonNums.length} уроков</Text>
            </View>
          </View>
          
          {lessonNums.length === 0 ? (
            <View style={styles.noLessonsBox}>
              <Text style={styles.noLessonsText}>Уроков нет</Text>
            </View>
          ) : (
            lessonNums.map(num => {
              const lesson = items[num];
              const hws = lesson.homework ? Object.values(lesson.homework) : [];
              const hasHw = hws.some(hw => hw.value);

              return (
                <View key={num} style={styles.lessonCard}>
                  {/* Lesson Meta Bar */}
                  <View style={styles.lessonMetaRow}>
                    <View style={styles.numPill}>
                      <Text style={styles.numPillText}>{lesson.num}</Text>
                    </View>
                    <View style={styles.timePill}>
                      <Text style={styles.timePillText}>{lesson.starttime} – {lesson.endtime}</Text>
                    </View>
                  </View>

                  {/* Subject & Topic */}
                  <Text style={styles.lessonSubject}>{lesson.name}</Text>
                  {lesson.topic ? (
                    <Text style={styles.lessonTopic}>{lesson.topic}</Text>
                  ) : null}
                  
                  {/* Homework Box */}
                  {hasHw && (
                    <View style={styles.homeworkContainer}>
                      <View style={styles.hwHeaderRow}>
                        <View style={styles.hwDot} />
                        <Text style={styles.homeworkLabel}>Домашнее задание</Text>
                      </View>
                      {hws.map((hw, idx) => (
                        hw.value ? (
                          <Text key={idx} style={styles.homeworkValue}>{hw.value}</Text>
                        ) : null
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      );
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={m3.surface} />
      
      {/* Hidden Dev Trigger Top Right */}
      <TouchableOpacity 
        style={styles.hiddenTrigger} 
        activeOpacity={1} 
        onPress={handleHiddenTrigger}
      />

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[m3.primary]}
            tintColor={m3.primary}
          />
        }
      >
        {/* Material 3 Top App Shell Header */}
        <View style={styles.appHeader}>
          <Text style={styles.appTitle}>Дневник 5Б</Text>
          <View style={styles.weekPill}>
            <Text style={styles.weekPillText}>
              {isOffline ? `⚠️ Архив за ${archiveInfo}` : weekInfo}
            </Text>
          </View>
        </View>

        {/* Material 3 Offline Warning Card */}
        {isOffline && (
          <View style={styles.offlineCard}>
            <View style={styles.offlineTextWrapper}>
              <View style={styles.offlineBadgeRow}>
                <View style={styles.offlinePulseDot} />
                <Text style={styles.offlineTag}>Офлайн режим</Text>
              </View>
              <Text style={styles.offlineSubtitle}>
                Показан архив за {archiveInfo}
              </Text>
              {archiveSavedTime ? (
                <Text style={styles.offlineTimestamp}>
                  Сохранено: {archiveSavedTime}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity style={styles.tonalPillBtnSmall} onPress={() => loadData(false)}>
              <Text style={styles.tonalPillBtnTextSmall}>Повторить</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Schedule List */}
        {renderSchedule()}
        
      </ScrollView>

      {/* Dev Menu Modal (Material 3 Dialog) */}
      <Modal visible={devModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.m3Dialog}>
            <TouchableOpacity 
              style={styles.dialogCloseBtn} 
              onPress={() => setDevModalVisible(false)}
            >
              <Text style={styles.dialogCloseText}>✕</Text>
            </TouchableOpacity>

            {devStep === 1 ? (
              <View style={styles.dialogContent}>
                <Text style={styles.dialogHeadline}>Режим разработчика</Text>
                <Text style={styles.dialogSupportingText}>
                  Только для Миши. Введите системный пароль для управления авторизацией.
                </Text>
                <TextInput
                  style={styles.m3Input}
                  secureTextEntry
                  placeholder="Пароль"
                  placeholderTextColor={m3.outline}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity style={styles.primaryPillBtn} onPress={handleDevLogin}>
                  <Text style={styles.primaryPillBtnText}>Войти</Text>
                </TouchableOpacity>
                {devError ? <Text style={styles.dialogErrorText}>{devError}</Text> : null}
              </View>
            ) : (
              <View style={styles.dialogContent}>
                <Text style={styles.dialogHeadline}>Токен авторизации</Text>
                <Text style={styles.dialogSupportingText}>
                  Введите новый auth_token школьного портала:
                </Text>
                <TextInput
                  style={[styles.m3Input, styles.m3InputMultiline]}
                  multiline
                  placeholder="Auth Token"
                  placeholderTextColor={m3.outline}
                  value={tokenInput}
                  onChangeText={setTokenInput}
                />
                <TouchableOpacity style={styles.primaryPillBtn} onPress={handleDevSaveToken}>
                  <Text style={styles.primaryPillBtnText}>Сохранить и обновить</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: m3.surface,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 40,
  },
  hiddenTrigger: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 72,
    height: 72,
    zIndex: 100,
  },

  // App Shell Header
  appHeader: {
    marginBottom: 24,
    alignItems: 'center',
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: m3.onSurface,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  weekPill: {
    backgroundColor: m3.surfaceContainerHigh,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: m3.outlineVariant,
  },
  weekPillText: {
    fontSize: 12,
    color: m3.onSurfaceVariant,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // Offline Card (Material 3 Banner)
  offlineCard: {
    backgroundColor: m3.warningContainer,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(246, 184, 111, 0.25)',
  },
  offlineTextWrapper: {
    flex: 1,
  },
  offlineBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  offlinePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: m3.warning,
    marginRight: 8,
  },
  offlineTag: {
    fontSize: 12,
    fontWeight: '700',
    color: m3.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  offlineSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: m3.onWarningContainer,
  },
  offlineTimestamp: {
    fontSize: 11,
    color: m3.warning,
    opacity: 0.8,
    marginTop: 2,
  },
  tonalPillBtnSmall: {
    backgroundColor: m3.surfaceContainerHighest,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: m3.outlineVariant,
    marginLeft: 8,
  },
  tonalPillBtnTextSmall: {
    color: m3.onSurface,
    fontSize: 12,
    fontWeight: '600',
  },

  // State Views
  centerContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: m3.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '500',
  },
  errorCard: {
    backgroundColor: m3.errorContainer,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.2)',
  },
  errorTitle: {
    color: m3.error,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorBody: {
    color: m3.onErrorContainer,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyCard: {
    backgroundColor: m3.surfaceContainer,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: m3.outlineVariant,
  },
  emptyText: {
    color: m3.onSurfaceVariant,
    fontSize: 15,
    marginBottom: 16,
  },

  // Day Card (Material 3 Surface Container)
  dayCard: {
    backgroundColor: m3.surfaceContainer,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: m3.outlineVariant,
  },
  dayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: m3.outlineVariant,
  },
  dayTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: m3.onSurface,
    letterSpacing: -0.3,
  },
  dayBadge: {
    backgroundColor: m3.surfaceContainerHighest,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 9999,
  },
  dayBadgeText: {
    fontSize: 11,
    color: m3.primary,
    fontWeight: '700',
  },
  noLessonsBox: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  noLessonsText: {
    color: m3.onSurfaceVariant,
    fontStyle: 'italic',
    fontSize: 13,
  },

  // Lesson Card (Material 3 High Container)
  lessonCard: {
    backgroundColor: m3.surfaceContainerHigh,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  lessonMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  numPill: {
    backgroundColor: m3.primaryContainer,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 9999,
    marginRight: 8,
  },
  numPillText: {
    color: m3.onPrimaryContainer,
    fontSize: 12,
    fontWeight: '800',
  },
  timePill: {
    backgroundColor: m3.surfaceContainerHighest,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  timePillText: {
    color: m3.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '600',
  },
  lessonSubject: {
    fontSize: 16,
    fontWeight: '700',
    color: m3.onSurface,
    marginBottom: 2,
  },
  lessonTopic: {
    fontSize: 13,
    color: m3.onSurfaceVariant,
    lineHeight: 18,
    marginTop: 2,
  },

  // Homework Container
  homeworkContainer: {
    marginTop: 10,
    backgroundColor: m3.surfaceContainerHighest,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: m3.primary,
  },
  hwHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  hwDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: m3.primary,
    marginRight: 6,
  },
  homeworkLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: m3.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  homeworkValue: {
    fontSize: 13,
    color: m3.onSurface,
    lineHeight: 19,
    marginTop: 2,
  },

  // Material 3 Buttons
  primaryPillBtn: {
    backgroundColor: m3.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 9999,
    alignItems: 'center',
    width: '100%',
  },
  primaryPillBtnText: {
    color: m3.onPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  tonalPillBtn: {
    backgroundColor: m3.surfaceContainerHighest,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 9999,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: m3.outlineVariant,
  },
  tonalPillBtnText: {
    color: m3.onSurface,
    fontSize: 13,
    fontWeight: '600',
  },

  // Material 3 Dialog Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  m3Dialog: {
    backgroundColor: m3.surfaceContainerHigh,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: m3.outlineVariant,
  },
  dialogCloseBtn: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: m3.surfaceContainerHighest,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogCloseText: {
    color: m3.onSurfaceVariant,
    fontSize: 14,
    fontWeight: '700',
  },
  dialogContent: {
    marginTop: 8,
  },
  dialogHeadline: {
    fontSize: 20,
    fontWeight: '700',
    color: m3.onSurface,
    marginBottom: 8,
  },
  dialogSupportingText: {
    fontSize: 13,
    color: m3.onSurfaceVariant,
    lineHeight: 18,
    marginBottom: 20,
  },
  m3Input: {
    backgroundColor: m3.surfaceContainerHighest,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: m3.onSurface,
    fontSize: 15,
    borderWidth: 1,
    borderColor: m3.outlineVariant,
    marginBottom: 20,
  },
  m3InputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dialogErrorText: {
    color: m3.error,
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
});
