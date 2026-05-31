package main

import (
	"sync"
)

// inFlightSet tracks action IDs currently being executed to prevent duplicate dispatch.
type inFlightSet struct {
	mu  sync.Mutex
	ids map[string]struct{}
}

func newInFlightSet() *inFlightSet {
	return &inFlightSet{ids: make(map[string]struct{})}
}

func (s *inFlightSet) add(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ids[id] = struct{}{}
}

func (s *inFlightSet) remove(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.ids, id)
}

func (s *inFlightSet) has(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.ids[id]
	return ok
}

var inFlight = newInFlightSet()

// dispatchAction handles an incoming action from the beacon response.
// The action ID is added to the in-flight set BEFORE the goroutine is spawned
// to prevent re-dispatch if the next beacon fires before the goroutine runs.
func dispatchAction(id, actionType string) {
	if inFlight.has(id) {
		return // already executing or executed
	}
	inFlight.add(id)

	go func() {
		defer inFlight.remove(id)

		// Ack first, then execute
		ackAction(id)

		switch actionType {
		case "get_link":
			startSession(id)
		case "kill":
			killSession()
			reportActionSuccess(id)
		case "recreate":
			killSession()
			startSession(id)
		}
	}()
}

// ackAction sets the action to dispatched on the manager.
func ackAction(id string) {
	url := currentManager() + "/actions/" + id + "/ack"
	payload := map[string]string{"machine_id": machineID}
	apiPost(url, payload, nil) //nolint:errcheck
}
