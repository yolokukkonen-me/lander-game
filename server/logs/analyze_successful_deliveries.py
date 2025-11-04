#!/usr/bin/env python3
"""
Анализ логов сегментов доставок орбов (v3.0)

Этот скрипт анализирует файлы success_segment_*.json (или success_delivery_*.json)
и предоставляет статистику по успешным маневрам.
"""

import json
import glob
import os
from pathlib import Path
from statistics import mean, median, stdev
from collections import defaultdict

def analyze_successful_deliveries(logs_dir='logs'):
    """
    Анализирует все логи успешных доставок
    """
    # Найти все файлы успешных доставок (старый и новый формат)
    pattern1 = os.path.join(logs_dir, 'success_segment_*.json')
    pattern2 = os.path.join(logs_dir, 'success_delivery_*.json')
    log_files = glob.glob(pattern1) + glob.glob(pattern2)
    
    if not log_files:
        print(f"❌ Файлы успешных доставок не найдены в {logs_dir}")
        print(f"💡 Играйте в игру - логи создаются автоматически при доставке орбов!")
        return
    
    print("=" * 70)
    print("📊 АНАЛИЗ СЕГМЕНТОВ УСПЕШНЫХ ДОСТАВОК ОРБОВ (v3.0)")
    print("=" * 70)
    print(f"\n📁 Найдено файлов-сегментов: {len(log_files)}")
    
    # Собираем статистику
    all_data = []
    total_frames = 0
    total_score = 0
    durations = []
    scores = []
    frame_counts = []
    
    # Статистика по действиям
    action_stats = defaultdict(int)
    total_actions = 0
    
    # Статистика финальных кадров (v3.0)
    delivery_events = 0
    landed_deliveries = 0
    flying_deliveries = 0
    
    # Анализируем каждый файл
    for file_path in log_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Проверяем формат (старый vs новый)
            if 'metadata' in data:
                # Новый формат с метаданными
                meta = data['metadata']
                frames = data['frames']
                
                total_frames += meta['totalFrames']
                total_score += meta['scoreEarned']
                scores.append(meta['scoreEarned'])
                frame_counts.append(meta['totalFrames'])
                
                # Длительность в секундах
                duration = meta['totalFrames'] * 3 / 60
                durations.append(duration)
                
            else:
                # Старый формат (массив кадров)
                frames = data
                frame_count = len(frames)
                frame_counts.append(frame_count)
                total_frames += frame_count
                
                duration = frame_count * 3 / 60
                durations.append(duration)
            
            # Анализируем действия в кадрах
            for frame in frames:
                total_actions += 1
                
                # Проверяем финальный кадр с deliveryEvent (v3.0)
                if frame.get('deliveryEvent'):
                    delivery_events += 1
                    if frame.get('landed'):
                        landed_deliveries += 1
                    else:
                        flying_deliveries += 1
                
                # Подсчет каждого действия
                if frame.get('left'):
                    action_stats['left'] += 1
                if frame.get('right'):
                    action_stats['right'] += 1
                if frame.get('thrust'):
                    action_stats['thrust'] += 1
                if frame.get('drop'):
                    action_stats['drop'] += 1
                
                # Комбинации действий
                controls = []
                if frame.get('left'):
                    controls.append('left')
                if frame.get('right'):
                    controls.append('right')
                if frame.get('thrust'):
                    controls.append('thrust')
                
                if controls:
                    combo = '+'.join(controls)
                    action_stats[f'combo_{combo}'] += 1
                else:
                    action_stats['no_action'] += 1
            
            all_data.append({
                'file': os.path.basename(file_path),
                'frames': len(frames),
                'duration': duration,
                'score': scores[-1] if scores and len(scores) == len(all_data) else None
            })
            
        except Exception as e:
            print(f"⚠️ Ошибка при чтении {file_path}: {e}")
            continue
    
    # Выводим общую статистику
    print("\n" + "=" * 70)
    print("📈 ОБЩАЯ СТАТИСТИКА")
    print("=" * 70)
    print(f"Всего успешных сегментов: {len(log_files)}")
    print(f"Всего кадров: {total_frames:,}")
    print(f"Общее время игры: {sum(durations) / 60:.1f} минут ({sum(durations):.1f} секунд)")
    
    # Статистика финальных кадров (v3.0)
    if delivery_events > 0:
        print(f"\n🎯 СТРАТЕГИЯ ДОСТАВКИ (v3.0):")
        print(f"  Финальных кадров с deliveryEvent: {delivery_events}")
        print(f"  Доставка с посадкой: {landed_deliveries} ({landed_deliveries/delivery_events*100:.1f}%)")
        print(f"  Доставка налету: {flying_deliveries} ({flying_deliveries/delivery_events*100:.1f}%)")
        if landed_deliveries > flying_deliveries:
            print(f"  → Игрок предпочитает БЕЗОПАСНУЮ стратегию (приземление)")
        else:
            print(f"  → Игрок предпочитает АГРЕССИВНУЮ стратегию (налету)")
    
    if scores:
        print(f"\n💰 ОЧКИ:")
        print(f"  Всего заработано: {total_score:,}")
        print(f"  Среднее за доставку: {mean(scores):.1f}")
        print(f"  Медиана: {median(scores):.1f}")
        if len(scores) > 1:
            print(f"  Станд. отклонение: {stdev(scores):.1f}")
        print(f"  Минимум: {min(scores)}")
        print(f"  Максимум: {max(scores)}")
    
    if durations:
        print(f"\n⏱️ ДЛИТЕЛЬНОСТЬ ДОСТАВОК:")
        print(f"  Средняя: {mean(durations):.1f}s")
        print(f"  Медиана: {median(durations):.1f}s")
        if len(durations) > 1:
            print(f"  Станд. отклонение: {stdev(durations):.1f}s")
        print(f"  Самая быстрая: {min(durations):.1f}s")
        print(f"  Самая медленная: {max(durations):.1f}s")
    
    if frame_counts:
        print(f"\n🎞️ КОЛИЧЕСТВО КАДРОВ:")
        print(f"  Среднее: {mean(frame_counts):.0f}")
        print(f"  Медиана: {median(frame_counts):.0f}")
        print(f"  Минимум: {min(frame_counts)}")
        print(f"  Максимум: {max(frame_counts)}")
    
    # Статистика по действиям
    if total_actions > 0:
        print(f"\n🎮 СТАТИСТИКА ДЕЙСТВИЙ:")
        print(f"  Всего действий проанализировано: {total_actions:,}")
        print(f"\n  Отдельные действия:")
        for action in ['left', 'right', 'thrust', 'drop']:
            count = action_stats.get(action, 0)
            pct = (count / total_actions * 100) if total_actions > 0 else 0
            print(f"    {action:8s}: {count:6,} ({pct:5.1f}%)")
        
        print(f"\n  Комбинации:")
        combos = [(k, v) for k, v in action_stats.items() if k.startswith('combo_')]
        combos.sort(key=lambda x: x[1], reverse=True)
        for combo, count in combos[:5]:  # Топ 5 комбинаций
            combo_name = combo.replace('combo_', '')
            pct = (count / total_actions * 100)
            print(f"    {combo_name:20s}: {count:6,} ({pct:5.1f}%)")
        
        no_action = action_stats.get('no_action', 0)
        pct = (no_action / total_actions * 100)
        print(f"    {'no action':20s}: {no_action:6,} ({pct:5.1f}%)")
    
    # Топ-5 лучших доставок (по очкам)
    if scores:
        print(f"\n🏆 ТОП-5 ЛУЧШИХ ДОСТАВОК (по очкам):")
        sorted_data = sorted(all_data, key=lambda x: x['score'] if x['score'] else 0, reverse=True)
        for i, delivery in enumerate(sorted_data[:5], 1):
            print(f"  {i}. {delivery['file']}")
            print(f"     Score: {delivery['score']}, Duration: {delivery['duration']:.1f}s, Frames: {delivery['frames']}")
    
    # Топ-5 самых быстрых доставок
    if durations:
        print(f"\n⚡ ТОП-5 САМЫХ БЫСТРЫХ ДОСТАВОК:")
        sorted_data = sorted(all_data, key=lambda x: x['duration'])
        for i, delivery in enumerate(sorted_data[:5], 1):
            score_str = f", Score: {delivery['score']}" if delivery['score'] else ""
            print(f"  {i}. {delivery['file']}")
            print(f"     Duration: {delivery['duration']:.1f}s, Frames: {delivery['frames']}{score_str}")
    
    # Рекомендации по качеству данных
    print(f"\n" + "=" * 70)
    print("💡 РЕКОМЕНДАЦИИ ДЛЯ ML ОБУЧЕНИЯ")
    print("=" * 70)
    
    if len(log_files) < 20:
        print("⚠️  Мало данных для качественного обучения")
        print(f"   Текущее: {len(log_files)} доставок")
        print(f"   Минимум: 20-30 доставок")
        print(f"   Нужно еще: ~{20 - len(log_files)} доставок")
    elif len(log_files) < 100:
        print("✅ Достаточно данных для начального обучения (Behavioral Cloning)")
        print(f"   Текущее: {len(log_files)} доставок")
        print(f"   Для лучшего качества: 100+ доставок")
    else:
        print("🎉 Отличный набор данных!")
        print(f"   {len(log_files)} доставок - достаточно для качественного обучения")
    
    if total_frames < 2000:
        print(f"\n⚠️  Мало кадров: {total_frames:,}")
        print(f"   Рекомендуется: 2,000+ кадров")
    elif total_frames < 10000:
        print(f"\n✅ Хорошее количество кадров: {total_frames:,}")
        print(f"   Для лучшего качества: 10,000+ кадров")
    else:
        print(f"\n🎉 Отличное количество кадров: {total_frames:,}")
    
    print("\n" + "=" * 70)
    print("🚀 СЛЕДУЮЩИЕ ШАГИ")
    print("=" * 70)
    print("1. Если нужно больше данных - продолжайте играть!")
    print("2. Используйте эти данные для обучения ML модели:")
    print("   - Behavioral Cloning: python ml_bot/training/train_bc.py")
    print("   - PPO (RL): python ml_bot/training/train_ppo.py")
    print("3. Запустите ML бота и сравните с вашей игрой!")
    print("=" * 70)

def export_combined_dataset(logs_dir='logs', output_file='combined_successful_segments.json'):
    """
    Объединяет все успешные сегменты в один файл для удобства
    """
    pattern1 = os.path.join(logs_dir, 'success_segment_*.json')
    pattern2 = os.path.join(logs_dir, 'success_delivery_*.json')
    log_files = glob.glob(pattern1) + glob.glob(pattern2)
    
    if not log_files:
        print("❌ Нет файлов для объединения")
        return
    
    combined = []
    
    for file_path in log_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Проверяем формат
            if 'metadata' in data and 'frames' in data:
                # Добавляем каждый кадр с маркером файла
                for frame in data['frames']:
                    frame['source_file'] = os.path.basename(file_path)
                    frame['delivery_score'] = data['metadata']['scoreEarned']
                    combined.append(frame)
            else:
                # Старый формат
                for frame in data:
                    frame['source_file'] = os.path.basename(file_path)
                    combined.append(frame)
        
        except Exception as e:
            print(f"⚠️ Ошибка при чтении {file_path}: {e}")
            continue
    
    # Сохраняем объединенный файл
    output_path = os.path.join(logs_dir, output_file)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(combined, f, indent=2)
    
    print(f"\n✅ Объединенный датасет сохранен: {output_path}")
    print(f"📊 Всего кадров: {len(combined):,}")
    print(f"📁 Из файлов: {len(log_files)}")

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Анализ логов сегментов успешных доставок орбов (v3.0)'
    )
    parser.add_argument(
        '--logs-dir', 
        type=str, 
        default='logs',
        help='Директория с логами (по умолчанию: logs)'
    )
    parser.add_argument(
        '--export',
        action='store_true',
        help='Объединить все логи в один файл'
    )
    parser.add_argument(
        '--output',
        type=str,
        default='combined_successful_segments.json',
        help='Имя файла для объединенного датасета'
    )
    
    args = parser.parse_args()
    
    # Основной анализ
    analyze_successful_deliveries(args.logs_dir)
    
    # Опционально: экспорт объединенного датасета
    if args.export:
        print("\n" + "=" * 70)
        print("📦 ОБЪЕДИНЕНИЕ ДАТАСЕТА")
        print("=" * 70)
        export_combined_dataset(args.logs_dir, args.output)

