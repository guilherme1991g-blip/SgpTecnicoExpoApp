import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { sendTechnicianLocationTrackingWebhook } from './webhookService';

export const BACKGROUND_TRACKING_TASK = 'VEGA_BACKGROUND_TRACKING_TASK';

let activeOsContext: { osId: number | string; chamado?: any } | null = null;

export const setActiveOsForTracking = (osId: number | string, chamado?: any) => {
  activeOsContext = { osId, chamado };
};

export const clearActiveOsForTracking = () => {
  activeOsContext = null;
};

// Define a tarefa de rastreamento em segundo plano
try {
  TaskManager.defineTask(BACKGROUND_TRACKING_TASK, async ({ data, error }) => {
    if (error) {
      console.warn('[BackgroundTracking] Erro na tarefa de localização:', error);
      return;
    }
    if (data) {
      const { locations } = data as { locations: Location.LocationObject[] };
      if (locations && locations.length > 0 && activeOsContext) {
        const loc = locations[locations.length - 1];
        const { latitude, longitude, speed } = loc.coords;
        try {
          await sendTechnicianLocationTrackingWebhook(
            activeOsContext.osId,
            latitude,
            longitude,
            activeOsContext.chamado,
            speed
          );
        } catch (err) {
          console.warn('[BackgroundTracking] Erro ao enviar webhook em background:', err);
        }
      }
    }
  });
} catch (e) {
  console.warn('[BackgroundTracking] Erro ao registrar TaskManager defineTask:', e);
}

export const startBackgroundLocationTracking = async (osId: number | string, chamado?: any) => {
  setActiveOsForTracking(osId, chamado);
  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') return false;

    try {
      await Location.requestBackgroundPermissionsAsync();
    } catch {}

    const isDefined = await TaskManager.isTaskDefined(BACKGROUND_TRACKING_TASK);
    if (!isDefined) {
      return false;
    }

    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TRACKING_TASK);
    if (!hasStarted) {
      await Location.startLocationUpdatesAsync(BACKGROUND_TRACKING_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10000,
        distanceInterval: 10,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Rastreamento em Tempo Real Ativo',
          notificationBody: 'Sua localização está sendo transmitida para a central.',
          notificationColor: '#0066FF',
        },
      });
    }
    return true;
  } catch (e) {
    console.warn('[BackgroundTracking] Falha ao iniciar rastreamento em segundo plano:', e);
    return false;
  }
};

export const stopBackgroundLocationTracking = async () => {
  clearActiveOsForTracking();
  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TRACKING_TASK);
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TRACKING_TASK);
    }
  } catch (e) {
    console.warn('[BackgroundTracking] Falha ao parar rastreamento em segundo plano:', e);
  }
};
