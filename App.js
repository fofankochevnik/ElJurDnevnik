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
  RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_TOKEN = 'c4486ffaabdefe0c538a83eb5edd899bc5fba6c5bf7071526e051a2c5a48b___209633';
const DEV_PASSWORD = 'OA3Byy1230';
const STUDENT_ID = '1781';
const DEV_KEY = '6566345ff2850c724676decefe5c2117';
const VENDOR = 'lpsk1733844979';

// Neumorphism colors
const bg = '#e0e5ec';
const lightShadow = '#ffffff';
const darkShadow = '#a3b1c6';
const textDark = '#4a5568';
const textLight = '#718096';
const accent = '#667eea';

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
      
      // Таймаут на 8 секунд для быстрого перехода в офлайн-режим при слабом интернете
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

      // Успешно получено по интернету
      setSchedule(days);
      setWeekInfo(infoStr);
      setIsOffline(false);

      // Сохраняем ровно ОДНУ копию (перезаписываем прошлую)
      const now = new Date();
      const pad = (n) => n.toString().padStart(2, '0');
      const timeStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)} в ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      
      // Получаем чистый диапазон дат, например "07.09 - 11.09" или "18.05 - 22.05"
      const dateRangeLabel = infoStr.replace(/^(Расписание:\s*|Летний режим\s*\(архив за\s*)/i, '').replace(/\)$/, '');

      const cachePayload = {
        days,
        infoStr,
        dateRange: dateRangeLabel,
        savedTime: timeStr,
      };

      await AsyncStorage.setItem('cached_schedule', JSON.stringify(cachePayload));
    } catch (err) {
      console.log('Запрос не удался, попытка загрузить кеш:', err.message);
      
      // Если интернет пропал — загружаем сохраненную копию
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
        console.error('Ошибка чтения архива из памяти:', cacheErr);
      }

      // Если интернета нет И в памяти еще ничего не сохранено
      setError(err.message || 'Нет подключения к интернету и нет сохраненного архива');
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

    const dayOfWeek = now.getDay(); 
    const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const monday = new Date(now);
    monday.setDate(now.getDate() - distanceToMonday);
    
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    return {
      dateStr: `${formatDate(monday)}-${formatDate(friday)}`,
      infoStr: `Расписание: ${monday.getDate()}.${monday.getMonth()+1} - ${friday.getDate()}.${friday.getMonth()+1}`
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
          <ActivityIndicator size="large" color={accent} />
          <Text style={styles.loadingText}>Получение данных...</Text>
        </View>
      );
    }

    if (error && !schedule) {
      return (
        <View style={[styles.neuFlat, styles.errorBox]}>
          <Text style={styles.errorText}>Ошибка при загрузке расписания.</Text>
          <Text style={styles.errorSubText}>{error}</Text>
          <TouchableOpacity style={[styles.neuFlat, styles.retryButton]} onPress={() => loadData(false)}>
            <Text style={styles.retryButtonText}>Повторить попытку</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const dates = Object.keys(schedule || {}).sort();
    
    if (dates.length === 0) {
      return (
        <View style={[styles.neuFlat, styles.errorBox]}>
          <Text style={styles.errorText}>Нет данных или расписание пусто.</Text>
          <TouchableOpacity style={[styles.neuFlat, styles.retryButton]} onPress={() => loadData(false)}>
            <Text style={styles.retryButtonText}>Обновить</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return dates.map((dateKey) => {
      const dayData = schedule[dateKey];
      const items = dayData.items || {};
      const lessonNums = Object.keys(items).sort((a,b) => parseInt(a) - parseInt(b));

      return (
        <View key={dateKey} style={[styles.neuFlat, styles.dayCard]}>
          <Text style={styles.dayTitle}>{dayData.title}</Text>
          
          {lessonNums.length === 0 ? (
            <Text style={styles.noLessonsText}>Нет уроков</Text>
          ) : (
            lessonNums.map(num => {
              const lesson = items[num];
              const hws = lesson.homework ? Object.values(lesson.homework) : [];
              const hasHw = hws.some(hw => hw.value);

              return (
                <View key={num} style={[styles.neuInset, styles.lessonItem]}>
                  <View style={styles.lessonHeader}>
                    <Text style={styles.lessonNum}>{lesson.num}</Text>
                    <Text style={styles.lessonTime}>{lesson.starttime} - {lesson.endtime}</Text>
                  </View>
                  <Text style={styles.lessonSubject}>{lesson.name}</Text>
                  {lesson.topic ? <Text style={styles.lessonTopic}>{lesson.topic}</Text> : null}
                  
                  {hasHw && (
                    <View style={styles.homeworkBox}>
                      <Text style={styles.homeworkTitle}>Домашнее задание</Text>
                      {hws.map((hw, idx) => (
                        hw.value ? <Text key={idx} style={styles.homeworkText}>{hw.value}</Text> : null
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
      {/* Hidden Trigger Top Right */}
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
            colors={[accent]}
            tintColor={accent}
          />
        }
      >
        <View style={[styles.neuFlat, styles.header]}>
          <Text style={styles.headerTitle}>Дневник 5Б</Text>
          <Text style={styles.headerSubtitle}>
            {isOffline ? `⚠️ Архив за ${archiveInfo}` : weekInfo}
          </Text>
        </View>

        {/* Баннер офлайн-режима с указанием даты архива */}
        {isOffline && (
          <View style={[styles.neuFlat, styles.offlineBanner]}>
            <Text style={styles.offlineIcon}>📡</Text>
            <View style={styles.offlineTextContainer}>
              <Text style={styles.offlineTitle}>Офлайн режим (нет интернета)</Text>
              <Text style={styles.offlineSubtitle}>
                Это архив за {archiveInfo}
              </Text>
              {archiveSavedTime ? (
                <Text style={styles.offlineTime}>
                  Сохранено: {archiveSavedTime}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity 
              style={[styles.neuFlat, styles.offlineRetryBtn]} 
              onPress={() => loadData(false)}
            >
              <Text style={styles.offlineRetryText}>Повторить</Text>
            </TouchableOpacity>
          </View>
        )}

        {renderSchedule()}
        
      </ScrollView>

      {/* Dev Menu Modal */}
      <Modal visible={devModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.neuFlat, styles.modalContent]}>
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={() => setDevModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>

            {devStep === 1 ? (
              <View>
                <Text style={styles.devTitle}>Только для миши это меню разработчика введи пароль</Text>
                <TextInput
                  style={[styles.neuInset, styles.input]}
                  secureTextEntry
                  placeholder="Пароль"
                  placeholderTextColor={textLight}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity style={[styles.neuFlat, styles.btn]} onPress={handleDevLogin}>
                  <Text style={styles.btnText}>Войти</Text>
                </TouchableOpacity>
                {devError ? <Text style={styles.errorMsg}>{devError}</Text> : null}
              </View>
            ) : (
              <View>
                <Text style={styles.devTitle}>Auth token</Text>
                <TextInput
                  style={[styles.neuInset, styles.input]}
                  placeholder="Токен"
                  placeholderTextColor={textLight}
                  value={tokenInput}
                  onChangeText={setTokenInput}
                />
                <TouchableOpacity style={[styles.neuFlat, styles.btn]} onPress={handleDevSaveToken}>
                  <Text style={styles.btnText}>Отправить</Text>
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
    backgroundColor: bg,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  hiddenTrigger: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 80,
    height: 80,
    zIndex: 100,
  },
  
  // Neumorphism Styles
  neuFlat: {
    backgroundColor: bg,
    borderRadius: 16,
    shadowColor: darkShadow,
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 8,
  },
  neuInset: {
    backgroundColor: bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: darkShadow,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },

  // Header
  header: {
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: textDark,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: textLight,
    textAlign: 'center',
  },

  // Offline Banner
  offlineBanner: {
    padding: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#d67e2a',
  },
  offlineIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  offlineTextContainer: {
    flex: 1,
  },
  offlineTitle: {
    fontWeight: 'bold',
    fontSize: 13,
    color: '#d67e2a',
    marginBottom: 2,
  },
  offlineSubtitle: {
    fontSize: 13,
    color: textDark,
    fontWeight: '600',
  },
  offlineTime: {
    fontSize: 11,
    color: textLight,
    marginTop: 2,
  },
  offlineRetryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginLeft: 8,
  },
  offlineRetryText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: accent,
  },

  // State Views
  centerContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: textLight,
    fontWeight: '600',
  },
  errorBox: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    color: '#e53e3e',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSubText: {
    color: textLight,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: accent,
    fontWeight: 'bold',
    fontSize: 14,
  },

  // Schedule
  dayCard: {
    padding: 20,
    marginBottom: 24,
  },
  dayTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: textDark,
    marginBottom: 16,
  },
  noLessonsText: {
    color: textLight,
    fontStyle: 'italic',
  },
  lessonItem: {
    padding: 16,
    marginBottom: 16,
  },
  lessonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(163, 177, 198, 0.3)',
    paddingBottom: 8,
    marginBottom: 8,
  },
  lessonNum: {
    fontWeight: 'bold',
    color: accent,
    fontSize: 18,
  },
  lessonTime: {
    fontSize: 12,
    color: textLight,
  },
  lessonSubject: {
    fontWeight: 'bold',
    fontSize: 16,
    color: textDark,
    marginBottom: 4,
  },
  lessonTopic: {
    fontSize: 14,
    color: textLight,
  },
  homeworkBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    borderLeftWidth: 4,
    borderLeftColor: accent,
  },
  homeworkTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: accent,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  homeworkText: {
    fontSize: 14,
    color: textDark,
    lineHeight: 20,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(224, 229, 236, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    padding: 30,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    padding: 5,
  },
  closeButtonText: {
    fontSize: 20,
    color: textLight,
  },
  devTitle: {
    fontSize: 16,
    color: textDark,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  input: {
    width: '100%',
    padding: 16,
    color: textDark,
    marginBottom: 24,
    fontSize: 16,
  },
  btn: {
    width: '100%',
    padding: 16,
    alignItems: 'center',
  },
  btnText: {
    fontWeight: 'bold',
    color: accent,
    fontSize: 16,
  },
  errorMsg: {
    color: '#e53e3e',
    marginTop: 16,
    textAlign: 'center',
  }
});
