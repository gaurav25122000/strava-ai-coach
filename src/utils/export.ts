import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useStore } from '../store/useStore';

export const exportActivitiesToCSV = async () => {
  try {
    const activities = useStore.getState().activities;

    if (!activities || activities.length === 0) {
      return false;
    }

    // CSV Header
    let csvString = "ID,Type,Date,Distance (km),Duration (s),Pace,Elevation (m),Heart Rate\n";

    // CSV Rows
    activities.forEach(act => {
      const row = [
        act.id,
        act.type,
        act.date,
        act.distance,
        act.duration,
        act.pace,
        act.elevation,
        act.heartRate
      ].join(',');

      csvString += row + '\n';
    });

    const fileName = `strava_export_${new Date().getTime()}.csv`;
    const fileUri = ((FileSystem as any).documentDirectory || '') + fileName;

    await FileSystem.writeAsStringAsync(fileUri, csvString, {
      encoding: 'utf8' as any, // fallback type
    });

    const canShare = await Sharing.isAvailableAsync();

    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Strava Activities',
        UTI: 'public.comma-separated-values-text' // For iOS
      });
      return true;
    } else {
      console.warn("Sharing is not available on this platform.");
      return false;
    }

  } catch (error) {
    console.error("Error exporting data:", error);
    return false;
  }
};
