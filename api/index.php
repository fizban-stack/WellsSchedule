<?php
require_once 'config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$method = $_SERVER['REQUEST_METHOD'];
$path = $_SERVER['PATH_INFO'] ?? '/';
$path = trim($path, '/');
$segments = explode('/', $path);

$resource = $segments[0] ?? '';
$id = $segments[1] ?? null;

$input = json_decode(file_get_contents('php://input'), true);

try {
    $db = getDB();

    switch ($resource) {
        case 'entries':
            handleEntries($db, $method, $id, $input);
            break;

        case 'chores':
            handleChores($db, $method, $id, $input);
            break;

        case 'recurring-entries':
            handleRecurringEntries($db, $method, $id, $input);
            break;

        case 'recurring-chores':
            handleRecurringChores($db, $method, $id, $input);
            break;

        case 'completions':
            handleCompletions($db, $method, $input);
            break;

        case 'gcal-config':
            handleGcalConfig($db, $method, $input);
            break;

        case 'chore-values':
            handleChoreValues($db, $method, $id, $input);
            break;

        default:
            http_response_code(404);
            echo json_encode(['error' => 'Resource not found']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

function handleEntries($db, $method, $id, $input) {
    if ($method === 'GET') {
        $stmt = $db->query("SELECT * FROM calendar_entries ORDER BY entry_date, time");
        echo json_encode($stmt->fetchAll());
    } elseif ($method === 'POST') {
        $stmt = $db->prepare("INSERT INTO calendar_entries (entry_date, title, time, description, assigned_to, recurring, recur_id)
                              VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $input['date'],
            $input['title'],
            $input['time'],
            $input['description'] ?? '',
            $input['assignedTo'] ?? null,
            $input['recurring'] ?? 0,
            $input['recurId'] ?? null
        ]);
        echo json_encode(['success' => true, 'id' => $db->lastInsertId()]);
    } elseif ($method === 'PUT' && $id) {
        $stmt = $db->prepare("UPDATE calendar_entries
                              SET title = ?, time = ?, description = ?, assigned_to = ?
                              WHERE id = ?");
        $stmt->execute([
            $input['title'],
            $input['time'],
            $input['description'] ?? '',
            $input['assignedTo'] ?? null,
            $id
        ]);
        echo json_encode(['success' => true]);
    } elseif ($method === 'DELETE' && $id) {
        $stmt = $db->prepare("DELETE FROM calendar_entries WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
    } elseif ($method === 'DELETE' && isset($input['clearAll'])) {
        $db->exec("DELETE FROM calendar_entries WHERE recurring = 0");
        echo json_encode(['success' => true]);
    }
}

function handleChores($db, $method, $id, $input) {
    if ($method === 'GET') {
        $stmt = $db->query("SELECT * FROM chores ORDER BY chore_date");
        echo json_encode($stmt->fetchAll());
    } elseif ($method === 'POST') {
        $stmt = $db->prepare("INSERT INTO chores (chore_date, text, assigned_to, completed, recurring, recur_id)
                              VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $input['date'],
            $input['text'],
            $input['assignedTo'] ?? null,
            $input['completed'] ?? 0,
            $input['recurring'] ?? 0,
            $input['recurId'] ?? null
        ]);
        echo json_encode(['success' => true, 'id' => $db->lastInsertId()]);
    } elseif ($method === 'PUT' && $id) {
        // Update chore (completion status or full update)
        if (isset($input['text']) && isset($input['assignedTo'])) {
            // Full update (edit chore)
            $stmt = $db->prepare("UPDATE chores SET text = ?, assigned_to = ? WHERE id = ?");
            $stmt->execute([$input['text'], $input['assignedTo'], $id]);
        } elseif (isset($input['completed'])) {
            // Just update completion status
            $stmt = $db->prepare("UPDATE chores SET completed = ? WHERE id = ?");
            $stmt->execute([$input['completed'], $id]);
        }
        echo json_encode(['success' => true]);
    } elseif ($method === 'DELETE' && $id) {
        $stmt = $db->prepare("DELETE FROM chores WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
    } elseif ($method === 'DELETE' && isset($input['clearAll'])) {
        $db->exec("DELETE FROM chores WHERE recurring = 0");
        echo json_encode(['success' => true]);
    }
}

function handleRecurringEntries($db, $method, $id, $input) {
    if ($method === 'GET') {
        $stmt = $db->query("SELECT * FROM recurring_entries");
        echo json_encode($stmt->fetchAll());
    } elseif ($method === 'POST') {
        $stmt = $db->prepare("INSERT INTO recurring_entries (id, title, time, description, assigned_to, start_date, end_date, frequency)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $input['id'],
            $input['title'],
            $input['time'],
            $input['description'] ?? '',
            $input['assignedTo'] ?? null,
            $input['startDate'],
            $input['endDate'] ?? null,
            $input['frequency']
        ]);
        echo json_encode(['success' => true]);
    } elseif ($method === 'DELETE' && $id) {
        // Delete recurring entry and all its instances
        $db->beginTransaction();
        $stmt = $db->prepare("DELETE FROM recurring_entries WHERE id = ?");
        $stmt->execute([$id]);
        $stmt = $db->prepare("DELETE FROM calendar_entries WHERE recur_id = ?");
        $stmt->execute([$id]);
        $db->commit();
        echo json_encode(['success' => true]);
    }
}

function handleRecurringChores($db, $method, $id, $input) {
    if ($method === 'GET') {
        $stmt = $db->query("SELECT * FROM recurring_chores");
        echo json_encode($stmt->fetchAll());
    } elseif ($method === 'POST') {
        $stmt = $db->prepare("INSERT INTO recurring_chores (id, text, assigned_to, start_date, end_date, frequency)
                              VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $input['id'],
            $input['text'],
            $input['assignedTo'] ?? null,
            $input['startDate'],
            $input['endDate'] ?? null,
            $input['frequency']
        ]);
        echo json_encode(['success' => true]);
    } elseif ($method === 'DELETE' && $id) {
        // Delete recurring chore and all its instances
        $db->beginTransaction();
        $stmt = $db->prepare("DELETE FROM recurring_chores WHERE id = ?");
        $stmt->execute([$id]);
        $stmt = $db->prepare("DELETE FROM chores WHERE recur_id = ?");
        $stmt->execute([$id]);
        $db->commit();
        echo json_encode(['success' => true]);
    }
}

function handleCompletions($db, $method, $input) {
    if ($method === 'GET') {
        $stmt = $db->query("SELECT * FROM monthly_completions");
        $rows = $stmt->fetchAll();

        // Convert to nested object format
        $result = [];
        foreach ($rows as $row) {
            if (!isset($result[$row['month']])) {
                $result[$row['month']] = [];
            }
            $result[$row['month']][$row['family_member']] = (int)$row['count'];
        }
        echo json_encode($result);
    } elseif ($method === 'POST') {
        $stmt = $db->prepare("INSERT INTO monthly_completions (month, family_member, count)
                              VALUES (?, ?, ?)
                              ON DUPLICATE KEY UPDATE count = ?");
        $stmt->execute([
            $input['month'],
            $input['familyMember'],
            $input['count'],
            $input['count']
        ]);
        echo json_encode(['success' => true]);
    }
}

function handleGcalConfig($db, $method, $input) {
    if ($method === 'GET') {
        $stmt = $db->query("SELECT * FROM gcal_config WHERE id = 1");
        $config = $stmt->fetch();
        echo json_encode($config ?: null);
    } elseif ($method === 'POST') {
        $stmt = $db->prepare("INSERT INTO gcal_config (id, api_key, calendar_id, updated_at)
                              VALUES (1, ?, ?, CURRENT_TIMESTAMP)
                              ON DUPLICATE KEY UPDATE
                              api_key = VALUES(api_key),
                              calendar_id = VALUES(calendar_id),
                              updated_at = CURRENT_TIMESTAMP");
        $stmt->execute([
            $input['apiKey'] ?? null,
            $input['calendarId'] ?? null
        ]);
        echo json_encode(['success' => true]);
    }
}

function handleChoreValues($db, $method, $id, $input) {
    if ($method === 'GET') {
        $stmt = $db->query("SELECT * FROM chore_values ORDER BY chore_name");
        echo json_encode($stmt->fetchAll());
    } elseif ($method === 'POST') {
        $stmt = $db->prepare("INSERT INTO chore_values (chore_name, dollar_value)
                              VALUES (?, ?)
                              ON DUPLICATE KEY UPDATE dollar_value = VALUES(dollar_value)");
        $stmt->execute([
            $input['choreName'],
            $input['dollarValue']
        ]);
        echo json_encode(['success' => true, 'id' => $db->lastInsertId()]);
    } elseif ($method === 'PUT' && $id) {
        $stmt = $db->prepare("UPDATE chore_values SET chore_name = ?, dollar_value = ? WHERE id = ?");
        $stmt->execute([
            $input['choreName'],
            $input['dollarValue'],
            $id
        ]);
        echo json_encode(['success' => true]);
    } elseif ($method === 'DELETE' && $id) {
        $stmt = $db->prepare("DELETE FROM chore_values WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
    }
}
