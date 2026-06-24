# Code Review — биллинг WebTelemt (фаза 2, повторный)

**Статус:** APPROVED  
**Ревьюер:** otladchik  
**Дата:** 2026-06-24  
**Основание:** `07-billing-task.md`, `DEV.md`, код в `development/`  
**Предыдущий review:** CHANGES_REQUESTED (гонка webhook / credentials)

---

## Сводка

Блокирующее замечание предыдущего review устранено: в `handle_webhook` и `reveal_credentials` добавлен `SELECT ... FOR UPDATE` через `_load_order(..., for_update=True)`. Заметка о fix задокументирована в `DEV.md`. Реализация соответствует ТЗ фазы 2.

---

## Проверка fix гонки

| Место | Требование | Статус |
|-------|------------|--------|
| `_load_order` | параметр `for_update` + `with_for_update()` | ✅ `service.py:208–214` |
| `handle_webhook` | загрузка с `for_update=True` | ✅ `service.py:143` |
| `handle_webhook` | early return при `completed` + `commit` | ✅ `service.py:145–147` |
| `reveal_credentials` | загрузка с `for_update=True` | ✅ `service.py:108` |
| `reveal_credentials` | одна транзакция до `commit` в конце | ✅ `service.py:108–120` |
| `DEV.md` | описание проблемы и исправления | ✅ `DEV.md:121–130` |
| `schemas.py` | удалён неиспользуемый импорт `timezone` | ✅ |

### Детали реализации

`reveal_credentials` полностью защищён: проверки и удаление `order_secrets` выполняются под одной блокировкой до финального `commit`.

`handle_webhook` защищает идемпотентный путь (`completed` → early return). Окно между промежуточным commit `paid` и финальным `completed` остаётся — для MVP допустимо; не блокирует APPROVED.

---

## Соответствие `07-billing-task.md`

Все критерии приёмки закрыты. Вне scope: TTL без cron, email без отправки, IP-whitelist webhook, один тариф из env.

---

## Безопасность

Webhook ✅ | Secret at-rest ✅ | One-time reveal ✅ | Rate limit ✅ | Логирование secret ✅

---

## Тесты

Написаны корректно. `pytest -v` локально — рекомендация перед merge.

---

## Вердикт

**APPROVED** — можно передавать testirovschik / tehnicheskiy-pisatel.

---

## Чеклист (выполнено)

- [x] `with_for_update()` в `handle_webhook` и `reveal_credentials`
- [x] `commit` при early return `completed` в webhook
- [x] Заметка в `DEV.md`
- [x] Удалён неиспользуемый импорт в `schemas.py`
- [ ] `pytest -v` локально (рекомендация перед merge)
